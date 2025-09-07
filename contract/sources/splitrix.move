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
    /// Error: Invalid debtor inputs or length mismatch.
    const E_INVALID_DEBTORS: u64 = 8;
    /// Error: Basis points sum must be exactly 10_000.
    const E_BP_SUM_INVALID: u64 = 9;
    /// Error: Invalid settlement inputs.
    const E_INVALID_SETTLEMENT_INPUT: u64 = 10;

    // =================================
    //         Structs & Resources
    // =================================

    /// A bill that created debts inside a group.
    /// Supports custom debtor percentages (basis points out of 10_000).
    struct Bill has store {
        bill_id: u64,
        payer: address,
        total_amount: u64,
        memo: vector<u8>,
        debtors: vector<address>,
        shares_bp: vector<u64>
    }

    /// A group of members who split expenses.
    /// Stored inside the central board object, keyed by a unique group_id.
    /// Simplified to only store bills and per-pair bill amounts (for traceability).
    struct Group has store {
        group_id: u64,
        admin: address,
        members: vector<address>,
        /// Bills within the group
        bills: Table<u64, Bill>,
        bill_ids: vector<u64>,
        bill_counter: u64,
        /// Per-pair bill breakdowns: debtor -> creditor -> (bill_id -> amount)
        pair_bill_amounts: Table<address, Table<address, Table<u64, u64>>>,
        /// FIFO order of bills per pair: debtor -> creditor -> bill_ids
        pair_bill_ids: Table<address, Table<address, vector<u64>>>
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
            bills: table::new(),
            bill_ids: vector[],
            bill_counter: 0,
            pair_bill_amounts: table::new(),
            pair_bill_ids: table::new()
        };
        board.groups.add(group_id, group);
    }

    /// Adds an expense to a group. The transaction signer is the payer.
    /// The cost is split among a selected list of debtors with percentages (basis points).
    /// Requirements:
    /// - debtors.length == shares_bp.length
    /// - sum(shares_bp) == 10_000
    /// - each debtor is a member and not the payer
    public entry fun add_expense(
        payer: &signer,
        group_id: u64,
        total_amount: u64,
        memo: vector<u8>,
        debtors: vector<address>,
        shares_bp: vector<u64>
    ) acquires SplitrixBoard {
        let payer_addr = signer::address_of(payer);
        let board = borrow_global_mut<SplitrixBoard>(get_board_obj_address());
        assert!(board.groups.contains(group_id), E_GROUP_NOT_FOUND);
        let group = board.groups.borrow_mut(group_id);

        assert!(group.members.contains(&payer_addr), E_NOT_A_MEMBER);

        // Validate custom debtors and shares
        let d_len = debtors.length();
        let s_len = shares_bp.length();
        assert!(d_len > 0 && d_len == s_len, E_INVALID_DEBTORS);
        let sum_bp = 0u64;
        let i = 0u64;
        while (i < d_len) {
            let d = debtors[i];
            assert!(group.members.contains(&d), E_NOT_A_MEMBER);
            // payer is allowed in the list; their share creates no debt
            sum_bp += shares_bp[i];
            i += 1;
        };
        assert!(sum_bp == 10000, E_BP_SUM_INVALID);

        // Compute per-debtor amounts by floor division and distribute remainder fairly
        let amounts = vector[];
        let j = 0u64;
        let allocated = 0u64;
        while (j < d_len) {
            let base = (total_amount * shares_bp[j]) / 10000;
            let remainder = (total_amount * shares_bp[j]) % 10000;
            amounts.push_back(base + remainder);
            allocated = allocated + base + remainder;
            j += 1;
        };
        assert!(allocated >= total_amount, E_BP_SUM_INVALID);

        // Create bill
        let bill_id = group.bill_counter;
        group.bill_counter = bill_id + 1;
        let bill = Bill {
            bill_id,
            payer: payer_addr,
            total_amount,
            memo,
            debtors,
            shares_bp
        };
        group.bills.add(bill_id, bill);
        group.bill_ids.push_back(bill_id);

        // Record pair bill breakdowns with reverse-pair netting and FIFO tracking
        let k = 0u64;
        while (k < d_len) {
            let debtor_addr = debtors[k];
            let amt_to_add = amounts[k];

            // skip if debtor is the payer; their share is not a debt
            if (debtor_addr == payer_addr) { k += 1; continue };

            // Net against reverse pair: payer owes debtor
            if (group.pair_bill_amounts.contains(payer_addr)) {
                let rev_cred_tbl = group.pair_bill_amounts.borrow_mut(payer_addr);
                if (rev_cred_tbl.contains(debtor_addr)) {
                    let rev_bill_tbl = rev_cred_tbl.borrow_mut(debtor_addr);
                    // Walk FIFO ids for reverse direction
                    if (group.pair_bill_ids.contains(payer_addr)) {
                        let rev_id_tbl = group.pair_bill_ids.borrow_mut(payer_addr);
                        if (rev_id_tbl.contains(debtor_addr)) {
                            let rev_ids = rev_id_tbl.borrow_mut(debtor_addr);
                            let idx = 0u64;
                            while (amt_to_add > 0 && rev_ids.length() > 0) {
                                let rid = rev_ids[0];
                                if (rev_bill_tbl.contains(rid)) {
                                    let rref = rev_bill_tbl.borrow_mut(rid);
                                    if (*rref <= amt_to_add) {
                                        amt_to_add -= *rref;
                                        rev_bill_tbl.remove(rid);
                                        rev_ids.remove(0);
                                    } else {
                                        *rref -= amt_to_add;
                                        amt_to_add = 0;
                                    };
                                } else {
                                    // if the bill entry is missing, remove the id to keep FIFO clean
                                    rev_ids.remove(0);
                                };
                                idx += 1;
                            };
                        };
                    };
                };
            };

            // Add remaining amount to debtor -> payer
            if (amt_to_add > 0) {
                if (group.pair_bill_amounts.contains(debtor_addr)) {
                    let cred_tbl = group.pair_bill_amounts.borrow_mut(debtor_addr);
                    if (cred_tbl.contains(payer_addr)) {
                        let bill_tbl = cred_tbl.borrow_mut(payer_addr);
                        bill_tbl.add(bill_id, amt_to_add);
                    } else {
                        let new_bill_tbl = table::new();
                        new_bill_tbl.add(bill_id, amt_to_add);
                        cred_tbl.add(payer_addr, new_bill_tbl);
                    };
                } else {
                    let cred_tbl_new = table::new();
                    let bill_tbl_new = table::new();
                    bill_tbl_new.add(bill_id, amt_to_add);
                    cred_tbl_new.add(payer_addr, bill_tbl_new);
                    group.pair_bill_amounts.add(debtor_addr, cred_tbl_new);
                };

                // track FIFO order
                if (group.pair_bill_ids.contains(debtor_addr)) {
                    let id_tbl = group.pair_bill_ids.borrow_mut(debtor_addr);
                    if (id_tbl.contains(payer_addr)) {
                        let vec_ref = id_tbl.borrow_mut(payer_addr);
                        vec_ref.push_back(bill_id);
                    } else {
                        let v = vector[];
                        v.push_back(bill_id);
                        id_tbl.add(payer_addr, v);
                    };
                } else {
                    let id_tbl_new = table::new();
                    let v2 = vector[];
                    v2.push_back(bill_id);
                    id_tbl_new.add(payer_addr, v2);
                    group.pair_bill_ids.add(debtor_addr, id_tbl_new);
                };
            };
            k += 1;
        };
    }

    /// Settles debt for specific bills using AptosCoin. The signer (debtor) pays the creditor.
    /// Caller specifies which bills to pay and how much for each. Also consumes FIFO entries.
    public entry fun settle_debt(
        debtor: &signer,
        group_id: u64,
        creditor: address,
        bill_ids: vector<u64>,
        amounts: vector<u64>
    ) acquires SplitrixBoard {
        let debtor_addr = signer::address_of(debtor);
        assert!(debtor_addr != creditor, E_CANNOT_SETTLE_WITH_SELF);
        let board = borrow_global_mut<SplitrixBoard>(get_board_obj_address());
        assert!(board.groups.contains(group_id), E_GROUP_NOT_FOUND);
        let group = board.groups.borrow_mut(group_id);
        assert!(group.members.contains(&debtor_addr), E_NOT_A_MEMBER);
        assert!(group.members.contains(&creditor), E_NOT_A_MEMBER);

        let n = bill_ids.length();
        assert!(
            n > 0 && n == amounts.length(),
            E_INVALID_SETTLEMENT_INPUT
        );

        // Compute total payment and validate per-bill availability
        let total_payment = 0u64;
        let i = 0u64;
        while (i < n) {
            let bid = bill_ids[i];
            let pay = amounts[i];
            assert!(pay > 0, E_INVALID_SETTLEMENT_INPUT);
            // ensure entry exists
            assert!(group.pair_bill_amounts.contains(debtor_addr), E_DEBT_NOT_FOUND);
            let cred_tbl = group.pair_bill_amounts.borrow_mut(debtor_addr);
            assert!(cred_tbl.contains(creditor), E_DEBT_NOT_FOUND);
            let bill_tbl = cred_tbl.borrow_mut(creditor);
            assert!(bill_tbl.contains(bid), E_DEBT_NOT_FOUND);
            let owed_ref = bill_tbl.borrow_mut(bid);
            assert!(*owed_ref >= pay, E_OVERPAYMENT);
            *owed_ref -= pay;
            if (*owed_ref == 0) {
                bill_tbl.remove(bid);
            };
            total_payment += pay;
            i += 1;
        };

        // Maintain FIFO list: remove any fully paid bill ids in order
        if (group.pair_bill_ids.contains(debtor_addr)) {
            let id_tbl = group.pair_bill_ids.borrow_mut(debtor_addr);
            if (id_tbl.contains(creditor)) {
                let vec_ref = id_tbl.borrow_mut(creditor);
                let z = 0u64;
                while (vec_ref.length() > 0) {
                    let fid = vec_ref[0];
                    // if there's still remaining in bill_tbl, stop
                    let still_owed = {
                        if (group.pair_bill_amounts.contains(debtor_addr)) {
                            let ct = group.pair_bill_amounts.borrow(debtor_addr);
                            if (ct.contains(creditor)) {
                                let bt = ct.borrow(creditor);
                                if (bt.contains(fid)) { 1 } else { 0 }
                            } else { 0 }
                        } else { 0 }
                    };
                    if (still_owed == 0) {
                        vec_ref.remove(0);
                    } else { break };
                    z += 1;
                };
            };
        };

        assert!(
            coin::balance<AptosCoin>(debtor_addr) >= total_payment,
            E_INSUFFICIENT_BALANCE
        );

        // Transfer the actual coins to the creditor.
        if (total_payment > 0) {
            aptos_account::transfer(debtor, creditor, total_payment);
        };
    }

    // =================================
    //         Internal Functions
    // =================================

    // =================================
    //         View Functions
    // =================================

    #[view]
    /// A public view function to check the current debt between two members in a group.
    /// Returns 0 if no debt exists. Sums remaining amounts across all bills.
    public fun get_debt(
        group_id: u64, debtor: address, creditor: address
    ): u64 acquires SplitrixBoard {
        let board = borrow_global<SplitrixBoard>(get_board_obj_address());
        if (!board.groups.contains(group_id)) {
            return 0
        };
        let group = board.groups.borrow(group_id);
        if (!group.pair_bill_amounts.contains(debtor)) {
            return 0
        };
        let cred_tbl = group.pair_bill_amounts.borrow(debtor);
        if (!cred_tbl.contains(creditor)) {
            return 0
        };
        let bill_tbl = cred_tbl.borrow(creditor);
        // Sum by scanning group.bill_ids and checking existence
        let len = group.bill_ids.length();
        let i = 0u64;
        let sum = 0u64;
        while (i < len) {
            let bid = group.bill_ids[i];
            if (bill_tbl.contains(bid)) {
                sum += *bill_tbl.borrow(bid);
            };
            i += 1;
        };
        sum
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
    /// Returns a summary for a bill: payer, total_amount, debtors, shares_bp.
    public fun get_bill_summary(
        group_id: u64, bill_id: u64
    ): (address, u64, vector<address>, vector<u64>) acquires SplitrixBoard {
        let board = borrow_global<SplitrixBoard>(get_board_obj_address());
        if (!board.groups.contains(group_id)) {
            return (@0x0, 0, vector[], vector[])
        };
        let group = board.groups.borrow(group_id);
        if (!group.bills.contains(bill_id)) {
            return (@0x0, 0, vector[], vector[])
        };
        let bill = group.bills.borrow(bill_id);
        let debtors_len = bill.debtors.length();
        let debtors_copy = vector[];
        let shares_copy = vector[];
        let i = 0u64;
        while (i < debtors_len) {
            debtors_copy.push_back(bill.debtors[i]);
            shares_copy.push_back(bill.shares_bp[i]);
            i += 1;
        };
        (bill.payer, bill.total_amount, debtors_copy, shares_copy)
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
        if (!group.pair_bill_amounts.contains(debtor)) {
            return (vector[], vector[])
        };
        let cred_amt_tbl = group.pair_bill_amounts.borrow(debtor);
        if (!cred_amt_tbl.contains(creditor)) {
            return (vector[], vector[])
        };
        let amt_tbl = cred_amt_tbl.borrow(creditor);
        let len = group.bill_ids.length();
        let ids_out = vector[];
        let amts_out = vector[];
        let i = 0u64;
        while (i < len) {
            let bid = group.bill_ids[i];
            if (amt_tbl.contains(bid)) {
                let amt = *amt_tbl.borrow(bid);
                if (amt > 0) {
                    ids_out.push_back(bid);
                    amts_out.push_back(amt);
                };
            };
            i += 1;
        };
        (ids_out, amts_out)
    }

    struct BillView has drop, store {
        bill_id: u64,
        memo: vector<u8>,
        payer: address,
        total_amount: u64,
        shares_bp: vector<u64>,
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
                    let shares_copy = vector[];
                    let dj = 0u64;
                    // compute each debtor's share amount deterministically (same as add_expense): base + remainder
                    let alloc = vector[];
                    let ai = 0u64;
                    while (ai < d_len) {
                        let prod = b.total_amount * b.shares_bp[ai];
                        let base = prod / 10000;
                        let remainder = prod % 10000;
                        alloc.push_back(base + remainder);
                        ai += 1;
                    };
                    while (dj < d_len) {
                        let debtor_addr = b.debtors[dj];
                        debtors_copy.push_back(debtor_addr);
                        shares_copy.push_back(b.shares_bp[dj]);

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
                        let share_amt = alloc[dj];
                        let paid_amt =
                            if (share_amt > remaining) {
                                share_amt - remaining
                            } else { 0 };
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

                    let bv =
                        BillView {
                            bill_id: b.bill_id,
                            memo: memo_copy,
                            payer: b.payer,
                            total_amount: b.total_amount,
                            shares_bp: shares_copy,
                            debtors: debtors_copy,
                            debtors_paid
                        };
                    bills_vec.push_back(bv);
                };
                bi += 1;
            };

            let group_view =
                GroupView {
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

    // =================================
    //         Contacts (per-user)
    // =================================

    /// Per-user contacts: map contact address -> name bytes, plus keys for iteration
    struct Contacts has key {
        names: Table<address, vector<u8>>,
        keys: vector<address>
    }

    /// Add or update a contact name for the signer.
    public entry fun upsert_contact(
        user: &signer, contact: address, name: vector<u8>
    ) acquires Contacts {
        let user_addr = signer::address_of(user);
        if (!exists<Contacts>(user_addr)) {
            move_to(
                user,
                Contacts {
                    names: table::new(),
                    keys: vector[]
                }
            );
        };
        let contacts = borrow_global_mut<Contacts>(user_addr);
        if (contacts.names.contains(contact)) {
            let _old = contacts.names.remove(contact);
            contacts.names.add(contact, name);
        } else {
            contacts.names.add(contact, name);
            contacts.keys.push_back(contact);
        };
    }

    /// Remove a contact for the signer.
    public entry fun remove_contact(user: &signer, contact: address) acquires Contacts {
        let user_addr = signer::address_of(user);
        if (!exists<Contacts>(user_addr)) { return };
        let contacts = borrow_global_mut<Contacts>(user_addr);
        if (contacts.names.contains(contact)) {
            contacts.names.remove(contact);
        };
        let (found, idx) = contacts.keys.index_of(&contact);
        if (found) {
            contacts.keys.remove(idx);
        };
    }

    #[view]
    /// Returns all contacts for a user as parallel arrays
    public fun get_contacts(user: address): (vector<address>, vector<vector<u8>>) acquires Contacts {
        if (!exists<Contacts>(user)) {
            return (vector[], vector[])
        };
        let contacts = borrow_global<Contacts>(user);
        let len = contacts.keys.length();
        let addrs = vector[];
        let names = vector[];
        let i = 0u64;
        while (i < len) {
            let a = contacts.keys[i];
            addrs.push_back(a);
            if (contacts.names.contains(a)) {
                let nm_ref = contacts.names.borrow(a);
                let nm_len = nm_ref.length();
                let nm_copy = vector[];
                let ni = 0u64;
                while (ni < nm_len) {
                    nm_copy.push_back(nm_ref[ni]);
                    ni += 1;
                };
                names.push_back(nm_copy);
            } else {
                names.push_back(vector[]);
            };
            i += 1;
        };
        (addrs, names)
    }

    #[view]
    /// Returns a single contact name; empty vector if not set
    public fun get_contact_name(user: address, contact: address): vector<u8> acquires Contacts {
        if (!exists<Contacts>(user)) {
            return vector[]
        };
        let contacts = borrow_global<Contacts>(user);
        if (!contacts.names.contains(contact)) {
            return vector[]
        };
        let nm_ref = contacts.names.borrow(contact);
        let nm_len = nm_ref.length();
        let nm_copy = vector[];
        let ni = 0u64;
        while (ni < nm_len) {
            nm_copy.push_back(nm_ref[ni]);
            ni += 1;
        };
        nm_copy
    }

    fun get_board_obj_address(): address {
        object::create_object_address(&@splitrix_addr, BOARD_OBJECT_SEED)
    }
}

