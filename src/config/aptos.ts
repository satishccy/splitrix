import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';

// Configure Aptos client for testnet
export const NETWORK = import.meta.env.VITE_APP_NETWORK as Network;
const config = new AptosConfig({ network: NETWORK });
export const aptos = new Aptos(config);

// Smart contract configuration
export const CONTRACT_ADDRESS = import.meta.env.VITE_MODULE_ADDRESS;
export const MODULE_NAME = "splitrix";

// Contract function names
export const FUNCTIONS = {
  CREATE_GROUP: `${CONTRACT_ADDRESS}::${MODULE_NAME}::create_group`,
  ADD_EXPENSE: `${CONTRACT_ADDRESS}::${MODULE_NAME}::add_expense`,
  SETTLE_DEBT: `${CONTRACT_ADDRESS}::${MODULE_NAME}::settle_debt`,
  GET_GROUPS_FOR_MEMBER: `${CONTRACT_ADDRESS}::${MODULE_NAME}::get_groups_for_member`,
  GET_DEBT: `${CONTRACT_ADDRESS}::${MODULE_NAME}::get_debt`,
  GET_GROUP_BILLS: `${CONTRACT_ADDRESS}::${MODULE_NAME}::get_group_bills`,
  GET_BILL_SUMMARY: `${CONTRACT_ADDRESS}::${MODULE_NAME}::get_bill_summary`,
  GET_GROUPS: `${CONTRACT_ADDRESS}::${MODULE_NAME}::get_groups`,
  // Contacts
  GET_CONTACTS: `${CONTRACT_ADDRESS}::${MODULE_NAME}::get_contacts`,
  GET_CONTACT_NAME: `${CONTRACT_ADDRESS}::${MODULE_NAME}::get_contact_name`,
  UPSERT_CONTACT: `${CONTRACT_ADDRESS}::${MODULE_NAME}::upsert_contact`,
  REMOVE_CONTACT: `${CONTRACT_ADDRESS}::${MODULE_NAME}::remove_contact`,
} as const;