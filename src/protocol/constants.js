/**
 * PostgreSQL Wire Protocol Constants
 * Based on PostgreSQL Protocol Version 3.0 specification
 */

// Protocol version constants
const PROTOCOL_VERSION_3_0 = 196608; // 3.0 in protocol format (3 << 16 | 0)
const SSL_REQUEST_CODE = 80877103; // Special protocol version for SSL requests
const CANCEL_REQUEST_CODE = 80877102; // Special protocol version for cancel requests

// Message type constants (Frontend to Backend)
const MESSAGE_TYPES = {
  // Frontend messages
  QUERY: 'Q', // Simple Query
  PARSE: 'P', // Parse (Extended Query)
  BIND: 'B', // Bind (Extended Query)
  DESCRIBE: 'D', // Describe
  EXECUTE: 'E', // Execute
  SYNC: 'S', // Sync
  TERMINATE: 'X', // Terminate
  PASSWORD_MESSAGE: 'p', // Password Message
  COPY_DATA: 'd', // Copy Data
  COPY_DONE: 'c', // Copy Done
  COPY_FAIL: 'f', // Copy Fail
  FUNCTION_CALL: 'F', // Function Call

  // Backend messages
  AUTHENTICATION: 'R', // Authentication
  BACKEND_KEY_DATA: 'K', // Backend Key Data
  BIND_COMPLETE: '2', // Bind Complete
  COMMAND_COMPLETE: 'C', // Command Complete
  DATA_ROW: 'D', // Data Row
  EMPTY_QUERY_RESPONSE: 'I', // Empty Query Response
  ERROR_RESPONSE: 'E', // Error Response
  FUNCTION_CALL_RESPONSE: 'V', // Function Call Response
  NO_DATA: 'n', // No Data
  NOTICE_RESPONSE: 'N', // Notice Response
  NOTIFICATION_RESPONSE: 'A', // Notification Response
  PARAMETER_DESCRIPTION: 't', // Parameter Description
  PARAMETER_STATUS: 'S', // Parameter Status
  PARSE_COMPLETE: '1', // Parse Complete
  PORTAL_SUSPENDED: 's', // Portal Suspended
  READY_FOR_QUERY: 'Z', // Ready For Query
  ROW_DESCRIPTION: 'T', // Row Description
  COPY_IN_RESPONSE: 'G', // Copy In Response
  COPY_OUT_RESPONSE: 'H', // Copy Out Response
  COPY_BOTH_RESPONSE: 'W', // Copy Both Response
};

// Authentication method constants
const AUTH_METHODS = {
  OK: 0, // Authentication successful
  KERBEROS_V4: 1, // Kerberos V4
  KERBEROS_V5: 2, // Kerberos V5
  CLEARTEXT_PASSWORD: 3, // Clear text password
  CRYPT_PASSWORD: 4, // crypt() password
  MD5_PASSWORD: 5, // MD5 password
  SCM_CREDENTIAL: 6, // SCM credential
  GSS: 7, // GSS
  GSS_CONTINUE: 8, // GSS continue
  SSPI: 9, // SSPI
  SASL: 10, // SASL
  SASL_CONTINUE: 11, // SASL continue
  SASL_FINAL: 12, // SASL final
};

// Transaction status constants
const TRANSACTION_STATUS = {
  IDLE: 'I', // Idle (not in a transaction block)
  IN_TRANSACTION: 'T', // In a transaction block
  IN_FAILED_TRANSACTION: 'E', // In a failed transaction block
};

// Data type OID constants (common PostgreSQL types)
const DATA_TYPES = {
  BOOL: 16, // boolean
  BYTEA: 17, // bytea
  CHAR: 18, // "char"
  NAME: 19, // name
  INT8: 20, // int8/bigint
  INT2: 21, // int2/smallint
  INT2VECTOR: 22, // int2vector
  INT4: 23, // int4/integer
  REGPROC: 24, // regproc
  TEXT: 25, // text
  OID: 26, // oid
  TID: 27, // tid
  XID: 28, // xid
  CID: 29, // cid
  OIDVECTOR: 30, // oidvector
  JSON: 114, // json
  XML: 142, // xml
  PGNODETREE: 194, // pg_node_tree
  POINT: 600, // point
  LSEG: 601, // lseg
  PATH: 602, // path
  BOX: 603, // box
  POLYGON: 604, // polygon
  LINE: 628, // line
  FLOAT4: 700, // float4/real
  FLOAT8: 701, // float8/double precision
  ABSTIME: 702, // abstime
  RELTIME: 703, // reltime
  TINTERVAL: 704, // tinterval
  UNKNOWN: 705, // unknown
  CIRCLE: 718, // circle
  CASH: 790, // money
  MACADDR: 829, // macaddr
  INET: 869, // inet
  CIDR: 650, // cidr
  MACADDR8: 774, // macaddr8
  ACLITEM: 1033, // aclitem
  BPCHAR: 1042, // bpchar
  VARCHAR: 1043, // varchar
  DATE: 1082, // date
  TIME: 1083, // time
  TIMESTAMP: 1114, // timestamp
  TIMESTAMPTZ: 1184, // timestamptz
  INTERVAL: 1186, // interval
  TIMETZ: 1266, // timetz
  BIT: 1560, // bit
  VARBIT: 1562, // varbit
  NUMERIC: 1700, // numeric
  REFCURSOR: 1790, // refcursor
  REGPROCEDURE: 2202, // regprocedure
  REGOPER: 2203, // regoper
  REGOPERATOR: 2204, // regoperator
  REGCLASS: 2205, // regclass
  REGTYPE: 2206, // regtype
  UUID: 2950, // uuid
  TXID_SNAPSHOT: 2970, // txid_snapshot
  PG_LSN: 3220, // pg_lsn
  TSVECTOR: 3614, // tsvector
  TSQUERY: 3615, // tsquery
  GTSVECTOR: 3642, // gtsvector
  REGCONFIG: 3734, // regconfig
  REGDICTIONARY: 3769, // regdictionary
  JSONB: 3802, // jsonb
  INT4RANGE: 3904, // int4range
  NUMRANGE: 3906, // numrange
  TSRANGE: 3908, // tsrange
  TSTZRANGE: 3910, // tstzrange
  DATERANGE: 3912, // daterange
  INT8RANGE: 3926, // int8range
};

// Format codes
const FORMAT_CODES = {
  TEXT: 0, // Text format
  BINARY: 1, // Binary format
};

// Error severity levels
const ERROR_SEVERITY = {
  ERROR: 'ERROR',
  FATAL: 'FATAL',
  PANIC: 'PANIC',
  WARNING: 'WARNING',
  NOTICE: 'NOTICE',
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  LOG: 'LOG',
};

// Common error codes (SQLSTATE)
const ERROR_CODES = {
  // Class 08 — Connection Exception
  CONNECTION_EXCEPTION: '08000',
  CONNECTION_DOES_NOT_EXIST: '08003',
  CONNECTION_FAILURE: '08006',
  SQLCLIENT_UNABLE_TO_ESTABLISH_SQLCONNECTION: '08001',
  SQLSERVER_REJECTED_ESTABLISHMENT_OF_SQLCONNECTION: '08004',
  TRANSACTION_RESOLUTION_UNKNOWN: '08007',
  PROTOCOL_VIOLATION: '08P01',

  // Class 0A — Feature Not Supported
  FEATURE_NOT_SUPPORTED: '0A000',

  // Class 22 — Data Exception
  DATA_EXCEPTION: '22000',
  STRING_DATA_RIGHT_TRUNCATION: '22001',
  NULL_VALUE_NOT_ALLOWED: '22004',
  INVALID_PARAMETER_VALUE: '22023',

  // Class 42 — Syntax Error or Access Rule Violation
  SYNTAX_ERROR_OR_ACCESS_RULE_VIOLATION: '42000',
  SYNTAX_ERROR: '42601',
  INSUFFICIENT_PRIVILEGE: '42501',
  UNDEFINED_COLUMN: '42703',
  UNDEFINED_FUNCTION: '42883',
  UNDEFINED_TABLE: '42P01',
  DUPLICATE_COLUMN: '42701',
  DUPLICATE_TABLE: '42P07',

  // Class XX — Internal Error
  INTERNAL_ERROR: 'XX000',
  DATA_CORRUPTED: 'XX001',
  INDEX_CORRUPTED: 'XX002',
};

// Default server parameters sent during connection startup
const DEFAULT_SERVER_PARAMETERS = {
  server_version: '13.0 (Mock)',
  server_encoding: 'UTF8',
  client_encoding: 'UTF8',
  application_name: '',
  is_superuser: 'off',
  session_authorization: 'postgres',
  DateStyle: 'ISO, MDY',
  IntervalStyle: 'postgres',
  TimeZone: 'UTC',
  integer_datetimes: 'on',
  standard_conforming_strings: 'on',
};

module.exports = {
  PROTOCOL_VERSION_3_0,
  SSL_REQUEST_CODE,
  CANCEL_REQUEST_CODE,
  MESSAGE_TYPES,
  AUTH_METHODS,
  TRANSACTION_STATUS,
  DATA_TYPES,
  FORMAT_CODES,
  ERROR_SEVERITY,
  ERROR_CODES,
  DEFAULT_SERVER_PARAMETERS,
};
