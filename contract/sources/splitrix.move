// This is a basic implementation of a Splitwise-like application on the Aptos blockchain.
// It allows users to create groups, log expenses, and settle debts using AptosCoin.
// This example is for instructional purposes and omits features like complex splitting or multi-currency support.

module splitrix_addr::splitrix {

    // =================================
    //         Imports
    // =================================
    use std::signer;
    use aptos_framework::object::{Self, ExtendRef};
    use aptos_std::table::{Self, Table};
    use aptos_framework::coin::{Self};
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_framework::aptos_account;

    // =================================
    //         Error Codes
    // =================================
    /// Error: The user is not a member of the specified group.
    const E_NOT_A_MEMBER: u64 = 1;
    /// Error: Group does not exist.
    const E_GROUP_NOT_FOUND: u64 = 2;
    /// Error: A user cannot settle a debt with themselves.
    const E_CANNOT_SETTLE_WITH_SELF: u64 = 3;
    /// Error: No debt was found for the specified debtor/creditor pair.
    const E_DEBT_NOT_FOUND: u64 = 4;
    /// Error: Provided members list cannot be empty.
    const E_EMPTY_MEMBERS: u64 = 5;
    /// Error: Insufficient Balance in the account
    const E_INSUFFICIENT_BALANCE: u64 = 6;
    /// Error: Payment amount exceeds outstanding debt.
    const E_OVERPAYMENT: u64 = 7;

    // =================================
    //         Structs & Resources
    // =================================

    /// A bill that created debts inside a group.
    struct Bill has store {
        bill_id: u64,
        payer: address,
        total_amount: u64,
        per_share_amount: u64,
        memo: vector<u8>,
        debtors: vector<address>
    }

    /// A group of members who split expenses.
    /// Stored inside the central board object, keyed by a unique group_id.
    struct Group has store {
        group_id: u64,
        admin: address,
        members: vector<address>,
        /// Debts: debtor -> (creditor -> amount)
        debts: Table<address, Table<address, u64>>,
        /// Aggregated totals for efficient views
        credit_totals: Table<address, u64>,
        debt_totals: Table<address, u64>,
        /// Bills within the group
        bills: Table<u64, Bill>,
        bill_ids: vector<u64>,
        bill_counter: u64,
        /// Per-pair bill breakdowns for traceability: debtor -> creditor -> (bill_id -> amount)
        pair_bill_amounts: Table<address, Table<address, Table<u64, u64>>>,
        /// Order of bills for FIFO settlement: debtor -> creditor -> bill_ids
        pair_bill_ids: Table<address, Table<address, vector<u64>>>,
        /// Indexes to list counterparties efficiently
        debtor_to_creditors: Table<address, vector<address>>,
        creditor_to_debtors: Table<address, vector<address>>
    }

    /// Central board stored in a named object; holds all groups and indexes.
    struct SplitrixBoard has key {
        groups: Table<u64, Group>,
        group_counter: u64,
        /// Index: member address -> groups they belong to
        member_to_groups: Table<address, vector<u64>>
    }

    /// Controller resource stored in the object for extend permissions.
    struct BoardObjectController has key {
        extend_ref: ExtendRef
    }

    const BOARD_OBJECT_SEED: vector<u8> = b"splitrix_board_v1";

    /// Initialize the board object. Must be called once by the module deployer/admin.
    fun init_module(sender: &signer) {
        let constructor_ref = &object::create_named_object(sender, BOARD_OBJECT_SEED);
        let board_object_signer = object::generate_signer(constructor_ref);

        move_to(
            &board_object_signer,
            BoardObjectController {
                extend_ref: object::generate_extend_ref(constructor_ref)
            }
        );

        move_to(
            &board_object_signer,
            SplitrixBoard {
                groups: table::new(),
                group_counter: 0,
                member_to_groups: table::new()
            }
        );
    }

    // =================================
    //         Public Functions
    // =================================

    /// Creates a new group and stores it inside the central board object under a unique group_id.
    /// The creator is automatically the admin and a member.
    public entry fun create_group(
        creator: &signer, initial_members: vector<address>
    ) acquires SplitrixBoard {
        let creator_addr = signer::address_of(creator);
        assert!(initial_members.length() > 0, E_EMPTY_MEMBERS);

        let board = borrow_global_mut<SplitrixBoard>(get_board_obj_address());

        let mut_members = initial_members;
        if (!mut_members.contains(&creator_addr)) {
            mut_members.push_back(creator_addr);
        };

        let group_id = board.group_counter;
        board.group_counter = group_id + 1;

        // Update member index before moving the group to avoid aliasing borrows on board
        let m_len = mut_members.length();
        let i = 0u64;
        while (i < m_len) {
            let member_addr = mut_members[i];
            if (board.member_to_groups.contains(member_addr)) {
                let groups_vec_ref = board.member_to_groups.borrow_mut(member_addr);
                groups_vec_ref.push_back(group_id);
            } else {
                let mut_vec = vector[];
                mut_vec.push_back(group_id);
                board.member_to_groups.add(member_addr, mut_vec);
            };
            i += 1;
        };

        let group = Group {
            group_id,
            admin: creator_addr,
            members: mut_members,
            debts: table::new(),
            credit_totals: table::new(),
            debt_totals: table::new(),
            bills: table::new(),
            bill_ids: vector[],
            bill_counter: 0,
            pair_bill_amounts: table::new(),
            pair_bill_ids: table::new(),
            debtor_to_creditors: table::new(),
            creditor_to_debtors: table::new()
        };
        board.groups.add(group_id, group);
    }

    /// Adds an expense to a group. The transaction signer is the payer.
    /// The cost is split equally among all group members.
    public entry fun add_expense(
        payer: &signer,
        group_id: u64,
        total_amount: u64,
        memo: vector<u8>
    ) acquires SplitrixBoard {
        let payer_addr = signer::address_of(payer);
        let board = borrow_global_mut<SplitrixBoard>(get_board_obj_address());
        assert!(board.groups.contains(group_id), E_GROUP_NOT_FOUND);
        let group = board.groups.borrow_mut(group_id);

        assert!(group.members.contains(&payer_addr), E_NOT_A_MEMBER);

        let num_members = group.members.length();
        let share = total_amount / num_members;
        let remainder = total_amount % num_members;

        // Build debtors list and update debts/aggregates with netting
        let debtors_vec = vector[]; // only those with positive added amount
        let added_vec = vector[]; // amounts parallel to debtors_vec
        let netted_members = vector[]; // members where reverse netting happened
        let netted_amounts = vector[]; // amounts netted
        let group_length = group.members.length();
        let i = 0u64;
        while (i < group_length) {
            let member_addr = group.members[i];
            if (member_addr != payer_addr) {
                let (added, netted) =
                    update_debt(
                        group,
                        member_addr,
                        payer_addr,
                        share + remainder
                    );
                if (added > 0) {
                    add_to_total(&mut group.credit_totals, payer_addr, added);
                    add_to_total(&mut group.debt_totals, member_addr, added);
                    debtors_vec.push_back(member_addr);
                    added_vec.push_back(added);
                };
                if (netted > 0) {
                    subtract_from_total(&mut group.credit_totals, member_addr, netted);
                    subtract_from_total(&mut group.debt_totals, payer_addr, netted);
                    netted_members.push_back(member_addr);
                    netted_amounts.push_back(netted);
                };
            };
            i += 1;
        };

        // Create bill
        let bill_id = group.bill_counter;
        group.bill_counter = bill_id + 1;
        let bill = Bill {
            bill_id,
            payer: payer_addr,
            total_amount,
            per_share_amount: share + remainder,
            memo,
            debtors: debtors_vec
        };
        group.bills.add(bill_id, bill);
        group.bill_ids.push_back(bill_id);

        // Record pair bill breakdowns and indexes for positive added amounts only
        let pos_len = debtors_vec.length();
        let j = 0u64;
        while (j < pos_len) {
            let debtor_addr = debtors_vec[j];
            let amount_added = added_vec[j];
            if (group.pair_bill_amounts.contains(debtor_addr)) {
                let cred_tbl = group.pair_bill_amounts.borrow_mut(debtor_addr);
                if (cred_tbl.contains(payer_addr)) {
                    let bill_tbl = cred_tbl.borrow_mut(payer_addr);
                    bill_tbl.add(bill_id, amount_added);
                } else {
                    let new_bill_tbl = table::new();
                    new_bill_tbl.add(bill_id, amount_added);
                    cred_tbl.add(payer_addr, new_bill_tbl);
                };
            } else {
                let cred_tbl_new = table::new();
                let bill_tbl_new = table::new();
                bill_tbl_new.add(bill_id, amount_added);
                cred_tbl_new.add(payer_addr, bill_tbl_new);
                group.pair_bill_amounts.add(debtor_addr, cred_tbl_new);
            };

            if (group.pair_bill_ids.contains(debtor_addr)) {
                let cred_vec_tbl = group.pair_bill_ids.borrow_mut(debtor_addr);
                if (cred_vec_tbl.contains(payer_addr)) {
                    let vec_ref = cred_vec_tbl.borrow_mut(payer_addr);
                    vec_ref.push_back(bill_id);
                } else {
                    let new_vec = vector[];
                    new_vec.push_back(bill_id);
                    cred_vec_tbl.add(payer_addr, new_vec);
                };
            } else {
                let cred_vec_tbl_new = table::new();
                let new_vec2 = vector[];
                new_vec2.push_back(bill_id);
                cred_vec_tbl_new.add(payer_addr, new_vec2);
                group.pair_bill_ids.add(debtor_addr, cred_vec_tbl_new);
            };

            add_unique_address_to_vector_table(
                &mut group.debtor_to_creditors, debtor_addr, payer_addr
            );
            add_unique_address_to_vector_table(
                &mut group.creditor_to_debtors, payer_addr, debtor_addr
            );

            j += 1;
        };

        // Consume reverse pair bill amounts FIFO for any netting that occurred
        let n_len = netted_members.length();
        let k = 0u64;
        while (k < n_len) {
            let m_addr = netted_members[k];
            let amt = netted_amounts[k];
            consume_fifo_pair_bill(group, payer_addr, m_addr, amt);
            k += 1;
        };
    }

    /// Settles a debt using AptosCoin. The signer (debtor) pays the creditor.
    public entry fun settle_debt(
        debtor: &signer,
        group_id: u64,
        creditor: address,
        payment_amount: u64
    ) acquires SplitrixBoard {
        let debtor_addr = signer::address_of(debtor);
        assert!(debtor_addr != creditor, E_CANNOT_SETTLE_WITH_SELF);
        let board = borrow_global_mut<SplitrixBoard>(get_board_obj_address());
        assert!(board.groups.contains(group_id), E_GROUP_NOT_FOUND);
        let group = board.groups.borrow_mut(group_id);
        assert!(group.members.contains(&debtor_addr), E_NOT_A_MEMBER);
        assert!(group.members.contains(&creditor), E_NOT_A_MEMBER);

        assert!(
            coin::balance<AptosCoin>(debtor_addr) >= payment_amount,
            E_INSUFFICIENT_BALANCE
        );

        // Access and modify the debtor's table of debts in a scoped block to release the borrow before further mutations on `group`.
        {
            let debtor_debts_table = group.debts.borrow_mut(debtor_addr);
            assert!(debtor_debts_table.contains(creditor), E_DEBT_NOT_FOUND);

            let current_debt = debtor_debts_table.borrow_mut(creditor);
            assert!(*current_debt >= payment_amount, E_OVERPAYMENT);
            if (*current_debt == payment_amount) {
                debtor_debts_table.remove(creditor);
            } else {
                *current_debt -= payment_amount;
            };
        };
        // update aggregates
        subtract_from_total(&mut group.credit_totals, creditor, payment_amount);
        subtract_from_total(&mut group.debt_totals, debtor_addr, payment_amount);

        // Update per-bill breakdowns FIFO for this debtor/creditor
        consume_fifo_pair_bill(group, debtor_addr, creditor, payment_amount);

        // If pair-level debt cleared, update counterpart indexes
        let pair_still_exists = {
            let debtor_debts_table_after = group.debts.borrow(debtor_addr);
            debtor_debts_table_after.contains(creditor)
        };
        if (!pair_still_exists) {
            if (group.debtor_to_creditors.contains(debtor_addr)) {
                let creditors_vec = group.debtor_to_creditors.borrow_mut(debtor_addr);
                let (found_c, idx_c) = creditors_vec.index_of(&creditor);
                if (found_c) {
                    creditors_vec.remove(idx_c);
                };
            };
            if (group.creditor_to_debtors.contains(creditor)) {
                let debtors_vec = group.creditor_to_debtors.borrow_mut(creditor);
                let (found_d, idx_d) = debtors_vec.index_of(&debtor_addr);
                if (found_d) {
                    debtors_vec.remove(idx_d);
                };
            };
        };

        // Transfer the actual coins to the creditor.
        aptos_account::transfer(debtor, creditor, payment_amount);
    }

    /// Consumes per-bill amounts FIFO for debtor->creditor by `amount`.
    fun consume_fifo_pair_bill(
        group: &mut Group,
        debtor_addr: address,
        creditor: address,
        amount: u64
    ) {
        let mut_remaining = amount;
        if (group.pair_bill_ids.contains(debtor_addr)) {
            let cred_vec_tbl = group.pair_bill_ids.borrow_mut(debtor_addr);
            if (cred_vec_tbl.contains(creditor)) {
                let vec_ref = cred_vec_tbl.borrow_mut(creditor);
                let bill_amt_tbl =
                    if (group.pair_bill_amounts.contains(debtor_addr)) {
                        let cred_amt_tbl =
                            group.pair_bill_amounts.borrow_mut(debtor_addr);
                        cred_amt_tbl.borrow_mut(creditor)
                    } else { return };
                while (mut_remaining > 0 && vec_ref.length() > 0) {
                    let first_bill_id = vec_ref[0];
                    let amt_ref = bill_amt_tbl.borrow_mut(first_bill_id);
                    if (mut_remaining >= *amt_ref) {
                        mut_remaining -= *amt_ref;
                        bill_amt_tbl.remove(first_bill_id);
                        vec_ref.remove(0);
                    } else {
                        *amt_ref -= mut_remaining;
                        mut_remaining = 0;
                    };
                };
            };
        };
    }

    // =================================
    //         Internal Functions
    // =================================

    /// Create or update a debt record, with cross-pair netting.
    /// Returns (added_amount, netted_amount).
    fun update_debt(
        group: &mut Group,
        debtor: address,
        creditor: address,
        amount: u64
    ): (u64, u64) {
        let mut_amount = amount;
        let mut_netted = 0u64;

        // Net against reverse pair: creditor -> debtor
        if (group.debts.contains(creditor)) {
            let creditor_table = group.debts.borrow_mut(creditor);
            if (creditor_table.contains(debtor)) {
                let reverse_ref = creditor_table.borrow_mut(debtor);
                if (*reverse_ref > 0) {
                    if (*reverse_ref >= mut_amount) {
                        *reverse_ref -= mut_amount;
                        mut_netted = mut_amount;
                        mut_amount = 0;
                        if (*reverse_ref == 0) {
                            creditor_table.remove(debtor);
                        };
                    } else {
                        mut_netted = *reverse_ref;
                        mut_amount -=*reverse_ref;
                        creditor_table.remove(debtor);
                    };
                };
            };
        };

        if (mut_amount > 0) {
            if (group.debts.contains(debtor)) {
                let debtor_table = group.debts.borrow_mut(debtor);
                if (debtor_table.contains(creditor)) {
                    let current_debt = debtor_table.borrow_mut(creditor);
                    *current_debt += mut_amount;
                } else {
                    debtor_table.add(creditor, mut_amount);
                };
            } else {
                let new_tbl = table::new();
                new_tbl.add(creditor, mut_amount);
                group.debts.add(debtor, new_tbl);
            };
        };

        (mut_amount, mut_netted)
    }

    /// Helpers to update per-member aggregate totals
    fun add_to_total(
        totals: &mut Table<address, u64>,
        member: address,
        amount: u64
    ) {
        if (totals.contains(member)) {
            let value_ref = totals.borrow_mut(member);
            *value_ref += amount;
        } else {
            totals.add(member, amount);
        }
    }

    fun subtract_from_total(
        totals: &mut Table<address, u64>,
        member: address,
        amount: u64
    ) {
        if (totals.contains(member)) {
            let value_ref = totals.borrow_mut(member);
            // caller ensures not underflow
            *value_ref -= amount;
        } else {
            // nothing to do if key missing
        }
    }

    /// Helper: add unique address to vector mapped by key in a table
    fun add_unique_address_to_vector_table(
        t: &mut Table<address, vector<address>>,
        key: address,
        value: address
    ) {
        if (t.contains(key)) {
            let vec_ref = t.borrow_mut(key);
            let (found, _) = vec_ref.index_of(&value);
            if (!found) {
                vec_ref.push_back(value);
            };
        } else {
            let v = vector[];
            v.push_back(value);
            t.add(key, v);
        }
    }

    // =================================
    //         View Functions
    // =================================

    #[view]
    /// A public view function to check the current debt between two members in a group.
    /// Returns 0 if no debt exists.
    public fun get_debt(
        group_id: u64, debtor: address, creditor: address
    ): u64 acquires SplitrixBoard {
        let board = borrow_global<SplitrixBoard>(get_board_obj_address());
        if (!board.groups.contains(group_id)) {
            return 0
        };

        let group = board.groups.borrow(group_id);
        if (!group.debts.contains(debtor)) {
            return 0
        };

        let debtor_debts_table = group.debts.borrow(debtor);
        if (!debtor_debts_table.contains(creditor)) {
            return 0
        };

        *debtor_debts_table.borrow(creditor)
    }

    #[view]
    /// Returns counterparties for a member in a group: (creditors, debtors)
    public fun get_counterparties(
        group_id: u64, member: address
    ): (vector<address>, vector<address>) acquires SplitrixBoard {
        let board = borrow_global<SplitrixBoard>(get_board_obj_address());
        if (!board.groups.contains(group_id)) {
            return (vector[], vector[])
        };
        let group = board.groups.borrow(group_id);
        let creditors =
            if (group.debtor_to_creditors.contains(member)) {
                let ref1 = group.debtor_to_creditors.borrow(member);
                let len1 = ref1.length();
                let out1 = vector[];
                let i1 = 0u64;
                while (i1 < len1) {
                    out1.push_back(ref1[i1]);
                    i1 += 1;
                };
                out1
            } else {
                vector[]
            };
        let debtors =
            if (group.creditor_to_debtors.contains(member)) {
                let ref2 = group.creditor_to_debtors.borrow(member);
                let len2 = ref2.length();
                let out2 = vector[];
                let i2 = 0u64;
                while (i2 < len2) {
                    out2.push_back(ref2[i2]);
                    i2 += 1;
                };
                out2
            } else {
                vector[]
            };
        (creditors, debtors)
    }

    #[view]
    /// Returns list of group_ids the member belongs to.
    public fun get_groups_for_member(member: address): vector<u64> acquires SplitrixBoard {
        let board = borrow_global<SplitrixBoard>(get_board_obj_address());
        if (!board.member_to_groups.contains(member)) {
            return vector[]
        };
        let groups_ref = board.member_to_groups.borrow(member);
        // clone to a new vector
        let len = groups_ref.length();
        let out = vector[];
        let i = 0u64;
        while (i < len) {
            out.push_back(groups_ref[i]);
            i += 1;
        };
        out
    }

    #[view]
    /// Returns member's aggregate credit and debt totals in a group.
    public fun get_member_balance_in_group(
        group_id: u64, member: address
    ): (u64, u64) acquires SplitrixBoard {
        let board = borrow_global<SplitrixBoard>(get_board_obj_address());
        if (!board.groups.contains(group_id)) {
            return (0, 0)
        };
        let group = board.groups.borrow(group_id);
        let credit =
            if (group.credit_totals.contains(member)) {
                *group.credit_totals.borrow(member)
            } else { 0 };
        let debt =
            if (group.debt_totals.contains(member)) {
                *group.debt_totals.borrow(member)
            } else { 0 };
        (credit, debt)
    }

    #[view]
    /// Returns the bill ids created in a group.
    public fun get_group_bills(group_id: u64): vector<u64> acquires SplitrixBoard {
        let board = borrow_global<SplitrixBoard>(get_board_obj_address());
        if (!board.groups.contains(group_id)) {
            return vector[]
        };
        let group = board.groups.borrow(group_id);
        let len = group.bill_ids.length();
        let out = vector[];
        let i = 0u64;
        while (i < len) {
            out.push_back(group.bill_ids[i]);
            i += 1;
        };
        out
    }

    #[view]
    /// Returns a summary for a bill: payer, total_amount, per_share_amount, debtors.
    public fun get_bill_summary(
        group_id: u64, bill_id: u64
    ): (address, u64, u64, vector<address>) acquires SplitrixBoard {
        let board = borrow_global<SplitrixBoard>(get_board_obj_address());
        if (!board.groups.contains(group_id)) {
            return (@0x0, 0, 0, vector[])
        };
        let group = board.groups.borrow(group_id);
        if (!group.bills.contains(bill_id)) {
            return (@0x0, 0, 0, vector[])
        };
        let bill = group.bills.borrow(bill_id);
        let debtors_len = bill.debtors.length();
        let debtors_copy = vector[];
        let i = 0u64;
        while (i < debtors_len) {
            debtors_copy.push_back(bill.debtors[i]);
            i += 1;
        };
        (bill.payer, bill.total_amount, bill.per_share_amount, debtors_copy)
    }

    #[view]
    /// Returns bill_ids and amounts owed from debtor to creditor in a group.
    public fun get_pair_bill_breakdown(
        group_id: u64, debtor: address, creditor: address
    ): (vector<u64>, vector<u64>) acquires SplitrixBoard {
        let board = borrow_global<SplitrixBoard>(get_board_obj_address());
        if (!board.groups.contains(group_id)) {
            return (vector[], vector[])
        };
        let group = board.groups.borrow(group_id);
        if (!group.pair_bill_ids.contains(debtor)) {
            return (vector[], vector[])
        };
        let cred_vec_tbl = group.pair_bill_ids.borrow(debtor);
        if (!cred_vec_tbl.contains(creditor)) {
            return (vector[], vector[])
        };
        let ids_ref = cred_vec_tbl.borrow(creditor);
        let len = ids_ref.length();
        let ids_out = vector[];
        let amts_out = vector[];
        let i = 0u64;
        if (group.pair_bill_amounts.contains(debtor)) {
            let cred_amt_tbl = group.pair_bill_amounts.borrow(debtor);
            if (cred_amt_tbl.contains(creditor)) {
                let amt_tbl = cred_amt_tbl.borrow(creditor);
                while (i < len) {
                    let bid = ids_ref[i];
                    if (amt_tbl.contains(bid)) {
                        ids_out.push_back(bid);
                        amts_out.push_back(*amt_tbl.borrow(bid));
                    };
                    i += 1;
                };
                return (ids_out, amts_out)
            };
        };
        (vector[], vector[])
    }


    struct BillView has drop, store {
        bill_id: u64,
        memo: vector<u8>,
        payer: address,
        total_amount: u64,
        per_share_amount: u64,
        debtors: vector<address>,
        debtors_paid: vector<u64>
    }

    struct GroupView has drop, store {
        group_id: u64,
        admin: address,
        members: vector<address>,
        bills: vector<BillView>
    }

    #[view]
    public fun get_groups(member: address): vector<GroupView> acquires SplitrixBoard {
        let board = borrow_global<SplitrixBoard>(get_board_obj_address());
        if (!board.member_to_groups.contains(member)) {
            return vector[]
        };

        let groups_ref = board.member_to_groups.borrow(member);
        let len = groups_ref.length();
        let out = vector[];
        let i = 0u64;
        while (i < len) {
            let group_id = groups_ref[i];
            let g = board.groups.borrow(group_id);

            // copy members
            let m_len = g.members.length();
            let members_copy = vector[];
            let mi = 0u64;
            while (mi < m_len) {
                members_copy.push_back(g.members[mi]);
                mi += 1;
            };

            // build bills with debtors_paid aligned to debtors
            let bills_vec = vector[];
            let b_len = g.bill_ids.length();
            let bi = 0u64;
            while (bi < b_len) {
                let bid = g.bill_ids[bi];
                if (g.bills.contains(bid)) {
                    let b = g.bills.borrow(bid);

                    // copy debtors and compute paid per debtor
                    let d_len = b.debtors.length();
                    let debtors_copy = vector[];
                    let debtors_paid = vector[];
                    let dj = 0u64;
                    while (dj < d_len) {
                        let debtor_addr = b.debtors[dj];
                        debtors_copy.push_back(debtor_addr);

                        // remaining owed for this debtor on this bill
                        let remaining = {
                            let r = 0u64;
                            if (g.pair_bill_amounts.contains(debtor_addr)) {
                                let cred_tbl = g.pair_bill_amounts.borrow(debtor_addr);
                                if (cred_tbl.contains(b.payer)) {
                                    let amt_tbl = cred_tbl.borrow(b.payer);
                                    if (amt_tbl.contains(b.bill_id)) {
                                        r = *amt_tbl.borrow(b.bill_id);
                                    };
                                };
                            };
                            r
                        };
                        let paid_amt = if (b.per_share_amount > remaining) { b.per_share_amount - remaining } else { 0 };
                        debtors_paid.push_back(paid_amt);
                        dj += 1;
                    };

                    // copy memo bytes
                    let memo_len = b.memo.length();
                    let memo_copy = vector[];
                    let mb_i = 0u64;
                    while (mb_i < memo_len) {
                        memo_copy.push_back(b.memo[mb_i]);
                        mb_i += 1;
                    };

                    let bv = BillView {
                        bill_id: b.bill_id,
                        memo: memo_copy,
                        payer: b.payer,
                        total_amount: b.total_amount,
                        per_share_amount: b.per_share_amount,
                        debtors: debtors_copy,
                        debtors_paid
                    };
                    bills_vec.push_back(bv);
                };
                bi += 1;
            };

            let group_view = GroupView {
                group_id: g.group_id,
                admin: g.admin,
                members: members_copy,
                bills: bills_vec
            };
            out.push_back(group_view);
            i += 1;
        };
        out
    }

    fun get_board_obj_address(): address {
        object::create_object_address(&@splitrix_addr, BOARD_OBJECT_SEED)
    }
}

