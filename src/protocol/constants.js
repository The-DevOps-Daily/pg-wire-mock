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

// SASL mechanism constants for SCRAM authentication
const SASL_MECHANISMS = {
  SCRAM_SHA_256: 'SCRAM-SHA-256',
  SCRAM_SHA_256_PLUS: 'SCRAM-SHA-256-PLUS',
};

// SCRAM authentication states
const SCRAM_STATES = {
  INITIAL: 'initial',
  FIRST_SENT: 'first-sent',
  ENDED: 'ended',
  ERROR: 'error',
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

  // Array types - PostgreSQL arrays have base type OID + 1000 convention for most types
  BOOL_ARRAY: 1000, // boolean[]
  BYTEA_ARRAY: 1001, // bytea[]
  CHAR_ARRAY: 1002, // "char"[]
  NAME_ARRAY: 1003, // name[]
  INT2_ARRAY: 1005, // int2[]
  INT2VECTOR_ARRAY: 1006, // int2vector[]
  INT4_ARRAY: 1007, // int4[]
  REGPROC_ARRAY: 1008, // regproc[]
  TEXT_ARRAY: 1009, // text[]
  OID_ARRAY: 1028, // oid[]
  TID_ARRAY: 1010, // tid[]
  XID_ARRAY: 1011, // xid[]
  CID_ARRAY: 1012, // cid[]
  OIDVECTOR_ARRAY: 1013, // oidvector[]
  BPCHAR_ARRAY: 1014, // bpchar[]
  VARCHAR_ARRAY: 1015, // varchar[]
  INT8_ARRAY: 1016, // int8[]
  POINT_ARRAY: 1017, // point[]
  LSEG_ARRAY: 1018, // lseg[]
  PATH_ARRAY: 1019, // path[]
  BOX_ARRAY: 1020, // box[]
  FLOAT4_ARRAY: 1021, // float4[]
  FLOAT8_ARRAY: 1022, // float8[]
  ABSTIME_ARRAY: 1023, // abstime[]
  RELTIME_ARRAY: 1024, // reltime[]
  TINTERVAL_ARRAY: 1025, // tinterval[]
  POLYGON_ARRAY: 1027, // polygon[]
  ACLITEM_ARRAY: 1034, // aclitem[]
  MACADDR_ARRAY: 1040, // macaddr[]
  INET_ARRAY: 1041, // inet[]
  CIDR_ARRAY: 651, // cidr[]
  TIMESTAMP_ARRAY: 1115, // timestamp[]
  DATE_ARRAY: 1182, // date[]
  TIME_ARRAY: 1183, // time[]
  TIMESTAMPTZ_ARRAY: 1185, // timestamptz[]
  INTERVAL_ARRAY: 1187, // interval[]
  NUMERIC_ARRAY: 1231, // numeric[]
  TIMETZ_ARRAY: 1270, // timetz[]
  BIT_ARRAY: 1561, // bit[]
  VARBIT_ARRAY: 1563, // varbit[]
  UUID_ARRAY: 2951, // uuid[]
  TXID_SNAPSHOT_ARRAY: 2949, // txid_snapshot[]
  JSON_ARRAY: 199, // json[]
  JSONB_ARRAY: 3807, // jsonb[]
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
  // Class 00 — Successful Completion
  SUCCESSFUL_COMPLETION: '00000',

  // Class 01 — Warning
  WARNING: '01000',
  DYNAMIC_RESULT_SETS_RETURNED: '0100C',
  IMPLICIT_ZERO_BIT_PADDING: '01008',
  NULL_VALUE_ELIMINATED_IN_SET_FUNCTION: '01003',
  PRIVILEGE_NOT_GRANTED: '01007',
  PRIVILEGE_NOT_REVOKED: '01006',
  STRING_DATA_RIGHT_TRUNCATION_WARNING: '01004',
  DEPRECATED_FEATURE: '01P01',

  // Class 02 — No Data
  NO_DATA: '02000',
  NO_ADDITIONAL_DYNAMIC_RESULT_SETS_RETURNED: '02001',

  // Class 03 — SQL Statement Not Yet Complete
  SQL_STATEMENT_NOT_YET_COMPLETE: '03000',

  // Class 08 — Connection Exception
  CONNECTION_EXCEPTION: '08000',
  CONNECTION_DOES_NOT_EXIST: '08003',
  CONNECTION_FAILURE: '08006',
  SQLCLIENT_UNABLE_TO_ESTABLISH_SQLCONNECTION: '08001',
  SQLSERVER_REJECTED_ESTABLISHMENT_OF_SQLCONNECTION: '08004',
  TRANSACTION_RESOLUTION_UNKNOWN: '08007',
  PROTOCOL_VIOLATION: '08P01',

  // Class 09 — Triggered Action Exception
  TRIGGERED_ACTION_EXCEPTION: '09000',

  // Class 0A — Feature Not Supported
  FEATURE_NOT_SUPPORTED: '0A000',

  // Class 0B — Invalid Transaction Initiation
  INVALID_TRANSACTION_INITIATION: '0B000',

  // Class 0F — Locator Exception
  LOCATOR_EXCEPTION: '0F000',
  INVALID_LOCATOR_SPECIFICATION: '0F001',

  // Class 0L — Invalid Grantor
  INVALID_GRANTOR: '0L000',
  INVALID_GRANT_OPERATION: '0LP01',

  // Class 0P — Invalid Role Specification
  INVALID_ROLE_SPECIFICATION: '0P000',

  // Class 20 — Case Not Found
  CASE_NOT_FOUND: '20000',

  // Class 21 — Cardinality Violation
  CARDINALITY_VIOLATION: '21000',

  // Class 22 — Data Exception
  DATA_EXCEPTION: '22000',
  ARRAY_SUBSCRIPT_ERROR: '2202E',
  CHARACTER_NOT_IN_REPERTOIRE: '22021',
  DATETIME_FIELD_OVERFLOW: '22008',
  DIVISION_BY_ZERO: '22012',
  ERROR_IN_ASSIGNMENT: '22005',
  ESCAPE_CHARACTER_CONFLICT: '2200B',
  INDICATOR_OVERFLOW: '22022',
  INTERVAL_FIELD_OVERFLOW: '22015',
  INVALID_ARGUMENT_FOR_LOGARITHM: '2201E',
  INVALID_ARGUMENT_FOR_NTILE_FUNCTION: '22014',
  INVALID_ARGUMENT_FOR_NTH_VALUE_FUNCTION: '22016',
  INVALID_ARGUMENT_FOR_POWER_FUNCTION: '2201F',
  INVALID_ARGUMENT_FOR_WIDTH_BUCKET_FUNCTION: '2201G',
  INVALID_CHARACTER_VALUE_FOR_CAST: '22018',
  INVALID_DATETIME_FORMAT: '22007',
  INVALID_ESCAPE_CHARACTER: '22019',
  INVALID_ESCAPE_OCTET: '2200D',
  INVALID_ESCAPE_SEQUENCE: '22025',
  NONSTANDARD_USE_OF_ESCAPE_CHARACTER: '22P06',
  INVALID_INDICATOR_PARAMETER_VALUE: '22010',
  INVALID_PARAMETER_VALUE: '22023',
  INVALID_REGULAR_EXPRESSION: '2201B',
  INVALID_ROW_COUNT_IN_LIMIT_CLAUSE: '2201W',
  INVALID_ROW_COUNT_IN_RESULT_OFFSET_CLAUSE: '2201X',
  INVALID_TIME_ZONE_DISPLACEMENT_VALUE: '22009',
  INVALID_USE_OF_ESCAPE_CHARACTER: '2200C',
  MOST_SPECIFIC_TYPE_MISMATCH: '2200G',
  NULL_VALUE_NOT_ALLOWED: '22004',
  NULL_VALUE_NO_INDICATOR_PARAMETER: '22002',
  NUMERIC_VALUE_OUT_OF_RANGE: '22003',
  STRING_DATA_LENGTH_MISMATCH: '22026',
  STRING_DATA_RIGHT_TRUNCATION: '22001',
  SUBSTRING_ERROR: '22011',
  TRIM_ERROR: '22027',
  UNTERMINATED_C_STRING: '22024',
  ZERO_LENGTH_CHARACTER_STRING: '2200F',
  FLOATING_POINT_EXCEPTION: '22P01',
  INVALID_TEXT_REPRESENTATION: '22P02',
  INVALID_BINARY_REPRESENTATION: '22P03',
  BAD_COPY_FILE_FORMAT: '22P04',
  UNTRANSLATABLE_CHARACTER: '22P05',
  NOT_AN_XML_DOCUMENT: '2200L',
  INVALID_XML_DOCUMENT: '2200M',
  INVALID_XML_CONTENT: '2200N',
  INVALID_XML_COMMENT: '2200S',
  INVALID_XML_PROCESSING_INSTRUCTION: '2200T',

  // Class 23 — Integrity Constraint Violation
  INTEGRITY_CONSTRAINT_VIOLATION: '23000',
  RESTRICT_VIOLATION: '23001',
  NOT_NULL_VIOLATION: '23502',
  FOREIGN_KEY_VIOLATION: '23503',
  UNIQUE_VIOLATION: '23505',
  CHECK_VIOLATION: '23514',
  EXCLUSION_VIOLATION: '23P01',

  // Class 24 — Invalid Cursor State
  INVALID_CURSOR_STATE: '24000',

  // Class 25 — Invalid Transaction State
  INVALID_TRANSACTION_STATE: '25000',
  ACTIVE_SQL_TRANSACTION: '25001',
  BRANCH_TRANSACTION_ALREADY_ACTIVE: '25002',
  HELD_CURSOR_REQUIRES_SAME_ISOLATION_LEVEL: '25008',
  INAPPROPRIATE_ACCESS_MODE_FOR_BRANCH_TRANSACTION: '25003',
  INAPPROPRIATE_ISOLATION_LEVEL_FOR_BRANCH_TRANSACTION: '25004',
  NO_ACTIVE_SQL_TRANSACTION_FOR_BRANCH_TRANSACTION: '25005',
  READ_ONLY_SQL_TRANSACTION: '25006',
  SCHEMA_AND_DATA_STATEMENT_MIXING_NOT_SUPPORTED: '25007',
  NO_ACTIVE_SQL_TRANSACTION: '25P01',
  IN_FAILED_SQL_TRANSACTION: '25P02',

  // Class 26 — Invalid SQL Statement Name
  INVALID_SQL_STATEMENT_NAME: '26000',

  // Class 27 — Triggered Data Change Violation
  TRIGGERED_DATA_CHANGE_VIOLATION: '27000',

  // Class 28 — Invalid Authorization Specification
  INVALID_AUTHORIZATION_SPECIFICATION: '28000',
  INVALID_PASSWORD: '28P01',

  // Class 2B — Dependent Privilege Descriptors Still Exist
  DEPENDENT_PRIVILEGE_DESCRIPTORS_STILL_EXIST: '2B000',
  DEPENDENT_OBJECTS_STILL_EXIST: '2BP01',

  // Class 2D — Invalid Transaction Termination
  INVALID_TRANSACTION_TERMINATION: '2D000',

  // Class 2F — SQL Routine Exception
  SQL_ROUTINE_EXCEPTION: '2F000',
  FUNCTION_EXECUTED_NO_RETURN_STATEMENT: '2F005',
  MODIFYING_SQL_DATA_NOT_PERMITTED: '2F002',
  PROHIBITED_SQL_STATEMENT_ATTEMPTED: '2F003',
  READING_SQL_DATA_NOT_PERMITTED: '2F004',

  // Class 34 — Invalid Cursor Name
  INVALID_CURSOR_NAME: '34000',

  // Class 38 — External Routine Exception
  EXTERNAL_ROUTINE_EXCEPTION: '38000',
  CONTAINING_SQL_NOT_PERMITTED: '38001',
  MODIFYING_SQL_DATA_NOT_PERMITTED_EXTERNAL: '38002',
  PROHIBITED_SQL_STATEMENT_ATTEMPTED_EXTERNAL: '38003',
  READING_SQL_DATA_NOT_PERMITTED_EXTERNAL: '38004',

  // Class 39 — External Routine Invocation Exception
  EXTERNAL_ROUTINE_INVOCATION_EXCEPTION: '39000',
  INVALID_SQLSTATE_RETURNED: '39001',
  NULL_VALUE_NOT_ALLOWED_EXTERNAL: '39004',
  TRIGGER_PROTOCOL_VIOLATED: '39P01',
  SRF_PROTOCOL_VIOLATED: '39P02',

  // Class 3B — Savepoint Exception
  SAVEPOINT_EXCEPTION: '3B000',
  INVALID_SAVEPOINT_SPECIFICATION: '3B001',

  // Class 3D — Invalid Catalog Name
  INVALID_CATALOG_NAME: '3D000',

  // Class 3F — Invalid Schema Name
  INVALID_SCHEMA_NAME: '3F000',

  // Class 40 — Transaction Rollback
  TRANSACTION_ROLLBACK: '40000',
  TRANSACTION_INTEGRITY_CONSTRAINT_VIOLATION: '40002',
  SERIALIZATION_FAILURE: '40001',
  STATEMENT_COMPLETION_UNKNOWN: '40003',
  DEADLOCK_DETECTED: '40P01',

  // Class 42 — Syntax Error or Access Rule Violation
  SYNTAX_ERROR_OR_ACCESS_RULE_VIOLATION: '42000',
  SYNTAX_ERROR: '42601',
  INSUFFICIENT_PRIVILEGE: '42501',
  CANNOT_COERCE: '42846',
  GROUPING_ERROR: '42803',
  WINDOWING_ERROR: '42P20',
  INVALID_RECURSION: '42P19',
  INVALID_FOREIGN_KEY: '42830',
  INVALID_NAME: '42602',
  NAME_TOO_LONG: '42622',
  RESERVED_NAME: '42939',
  DATATYPE_MISMATCH: '42804',
  INDETERMINATE_DATATYPE: '42P18',
  COLLATION_MISMATCH: '42P21',
  INDETERMINATE_COLLATION: '42P22',
  WRONG_OBJECT_TYPE: '42809',
  UNDEFINED_COLUMN: '42703',
  UNDEFINED_FUNCTION: '42883',
  UNDEFINED_TABLE: '42P01',
  UNDEFINED_PARAMETER: '42P02',
  UNDEFINED_OBJECT: '42704',
  DUPLICATE_COLUMN: '42701',
  DUPLICATE_CURSOR: '42P03',
  DUPLICATE_DATABASE: '42P04',
  DUPLICATE_FUNCTION: '42723',
  DUPLICATE_PREPARED_STATEMENT: '42P05',
  DUPLICATE_SCHEMA: '42P06',
  DUPLICATE_TABLE: '42P07',
  DUPLICATE_ALIAS: '42712',
  DUPLICATE_OBJECT: '42710',
  AMBIGUOUS_COLUMN: '42702',
  AMBIGUOUS_FUNCTION: '42725',
  AMBIGUOUS_PARAMETER: '42P08',
  AMBIGUOUS_ALIAS: '42P09',
  INVALID_COLUMN_REFERENCE: '42P10',
  INVALID_COLUMN_DEFINITION: '42611',
  INVALID_CURSOR_DEFINITION: '42P11',
  INVALID_DATABASE_DEFINITION: '42P12',
  INVALID_FUNCTION_DEFINITION: '42P13',
  INVALID_PREPARED_STATEMENT_DEFINITION: '42P14',
  INVALID_SCHEMA_DEFINITION: '42P15',
  INVALID_TABLE_DEFINITION: '42P16',
  INVALID_OBJECT_DEFINITION: '42P17',

  // Class 44 — WITH CHECK OPTION Violation
  WITH_CHECK_OPTION_VIOLATION: '44000',

  // Class 53 — Insufficient Resources
  INSUFFICIENT_RESOURCES: '53000',
  DISK_FULL: '53100',
  OUT_OF_MEMORY: '53200',
  TOO_MANY_CONNECTIONS: '53300',
  CONFIGURATION_LIMIT_EXCEEDED: '53400',

  // Class 54 — Program Limit Exceeded
  PROGRAM_LIMIT_EXCEEDED: '54000',
  STATEMENT_TOO_COMPLEX: '54001',
  TOO_MANY_COLUMNS: '54011',
  TOO_MANY_ARGUMENTS: '54023',

  // Class 55 — Object Not In Prerequisite State
  OBJECT_NOT_IN_PREREQUISITE_STATE: '55000',
  OBJECT_IN_USE: '55006',
  CANT_CHANGE_RUNTIME_PARAM: '55P02',
  LOCK_NOT_AVAILABLE: '55P03',

  // Class 57 — Operator Intervention
  OPERATOR_INTERVENTION: '57000',
  QUERY_CANCELED: '57014',
  ADMIN_SHUTDOWN: '57P01',
  CRASH_SHUTDOWN: '57P02',
  CANNOT_CONNECT_NOW: '57P03',
  DATABASE_DROPPED: '57P04',

  // Class 58 — System Error
  SYSTEM_ERROR: '58000',
  IO_ERROR: '58030',
  UNDEFINED_FILE: '58P01',
  DUPLICATE_FILE: '58P02',

  // Class F0 — Configuration File Error
  CONFIG_FILE_ERROR: 'F0000',
  LOCK_FILE_EXISTS: 'F0001',

  // Class HV — Foreign Data Wrapper Error
  FDW_ERROR: 'HV000',
  FDW_COLUMN_NAME_NOT_FOUND: 'HV005',
  FDW_DYNAMIC_PARAMETER_VALUE_NEEDED: 'HV002',
  FDW_FUNCTION_SEQUENCE_ERROR: 'HV010',
  FDW_INCONSISTENT_DESCRIPTOR_INFORMATION: 'HV021',
  FDW_INVALID_ATTRIBUTE_VALUE: 'HV024',
  FDW_INVALID_COLUMN_NAME: 'HV007',
  FDW_INVALID_COLUMN_NUMBER: 'HV008',
  FDW_INVALID_DATA_TYPE: 'HV004',
  FDW_INVALID_DATA_TYPE_DESCRIPTORS: 'HV006',
  FDW_INVALID_DESCRIPTOR_FIELD_IDENTIFIER: 'HV091',
  FDW_INVALID_HANDLE: 'HV00B',
  FDW_INVALID_OPTION_INDEX: 'HV00C',
  FDW_INVALID_OPTION_NAME: 'HV00D',
  FDW_INVALID_STRING_LENGTH_OR_BUFFER_LENGTH: 'HV090',
  FDW_INVALID_STRING_FORMAT: 'HV00A',
  FDW_INVALID_USE_OF_NULL_POINTER: 'HV009',
  FDW_TOO_MANY_HANDLES: 'HV014',
  FDW_OUT_OF_MEMORY: 'HV001',
  FDW_NO_SCHEMAS: 'HV00P',
  FDW_OPTION_NAME_NOT_FOUND: 'HV00J',
  FDW_REPLY_HANDLE: 'HV00K',
  FDW_SCHEMA_NOT_FOUND: 'HV00Q',
  FDW_TABLE_NOT_FOUND: 'HV00R',
  FDW_UNABLE_TO_CREATE_EXECUTION: 'HV00L',
  FDW_UNABLE_TO_CREATE_REPLY: 'HV00M',
  FDW_UNABLE_TO_ESTABLISH_CONNECTION: 'HV00N',

  // Class P0 — PL/pgSQL Error
  PLPGSQL_ERROR: 'P0000',
  RAISE_EXCEPTION: 'P0001',
  NO_DATA_FOUND: 'P0002',
  TOO_MANY_ROWS: 'P0003',

  // Class XX — Internal Error
  INTERNAL_ERROR: 'XX000',
  DATA_CORRUPTED: 'XX001',
  INDEX_CORRUPTED: 'XX002',

  // SCRAM Authentication Error Codes
  SCRAM_INVALID_PROOF: '28000', // Invalid authentication specification
  SCRAM_INVALID_AUTHORIZATION_MESSAGE: '28000', // Invalid authorization message
  SCRAM_CHANNEL_BINDING_NOT_SUPPORTED: '0A000', // Feature not supported
  SCRAM_CHANNEL_BINDING_REQUIRED: '28000', // Channel binding required
  SCRAM_UNKNOWN_ATTRIBUTE: '08P01', // Protocol violation
  SCRAM_INVALID_NONCE: '08P01', // Protocol violation
  SCRAM_ITERATION_COUNT_MISMATCH: '08P01', // Protocol violation
};

// Standardized error messages
const ERROR_MESSAGES = {
  // Query parsing errors
  EMPTY_QUERY: 'empty query string',
  UNTERMINATED_STRING: 'unterminated quoted string',
  UNTERMINATED_IDENTIFIER: 'unterminated quoted identifier',

  // Protocol errors
  INVALID_MESSAGE_FORMAT: 'invalid message format',
  INVALID_PARSE_MESSAGE: 'invalid Parse message format',
  INVALID_BIND_MESSAGE: 'invalid Bind message format',
  INVALID_DESCRIBE_MESSAGE: 'invalid Describe message format',
  INVALID_EXECUTE_MESSAGE: 'invalid Execute message format',
  UNKNOWN_MESSAGE_TYPE: 'unknown message type',
  PROTOCOL_ERROR: 'protocol error',
  MESSAGE_PROCESSING_ERROR: 'message processing error',
  MALFORMED_CANCEL_REQUEST: 'malformed cancel request received',

  // Array errors
  INVALID_ARRAY_FORMAT: 'Invalid array format',
  MISSING_OUTER_BRACES: 'Invalid array format: missing outer braces',
  MISMATCHED_BRACES: 'Invalid array format: mismatched braces',
  INVALID_ARRAY_ELEMENT: 'invalid array element',
  ARRAY_DIMENSION_MISMATCH:
    'multidimensional arrays must have array expressions with matching dimensions',

  // Feature support errors
  FUNCTION_CALL_NOT_SUPPORTED: 'function call protocol not supported',
  COPY_NOT_SUPPORTED: 'COPY protocol not supported in this server',
  FEATURE_NOT_IMPLEMENTED: 'feature is not implemented',

  // Object existence errors
  PORTAL_DOES_NOT_EXIST: 'portal does not exist',
  PREPARED_STATEMENT_DOES_NOT_EXIST: 'prepared statement does not exist',
  CURSOR_DOES_NOT_EXIST: 'cursor does not exist',

  // Copy protocol errors
  COPY_FAILED: 'COPY failed',
  COPY_IN_PROGRESS: 'COPY in progress',

  // Data type errors
  INVALID_INPUT_SYNTAX: 'invalid input syntax',
  INVALID_TEXT_REPRESENTATION: 'invalid input syntax for type',
  TYPE_MISMATCH: 'type mismatch',
  CANNOT_CAST: 'cannot cast type',

  // Transaction errors
  NOT_IN_TRANSACTION: 'there is no transaction in progress',
  ALREADY_IN_TRANSACTION: 'there is already a transaction in progress',
  TRANSACTION_ABORTED:
    'current transaction is aborted, commands ignored until end of transaction block',
  UNKNOWN_TRANSACTION_COMMAND: 'unknown transaction command',

  // Query errors
  INVALID_SET_SYNTAX: 'invalid SET command syntax',

  // Resource errors
  TOO_MANY_CONNECTIONS: 'sorry, too many clients already',
  OUT_OF_MEMORY: 'out of memory',
  QUERY_TOO_LONG: 'query string is too long',

  // SCRAM Authentication errors
  SCRAM_INVALID_PROOF: 'authentication failed',
  SCRAM_INVALID_AUTHORIZATION_MESSAGE: 'invalid SCRAM authorization message',
  SCRAM_CHANNEL_BINDING_NOT_SUPPORTED: 'channel binding not supported',
  SCRAM_CHANNEL_BINDING_REQUIRED: 'channel binding required but not provided',
  SCRAM_UNKNOWN_ATTRIBUTE: 'unknown SCRAM attribute',
  SCRAM_INVALID_NONCE: 'invalid nonce in SCRAM exchange',
  SCRAM_ITERATION_COUNT_MISMATCH: 'iteration count mismatch in SCRAM',
  SCRAM_MECHANISM_NOT_SUPPORTED: 'SCRAM mechanism not supported',

  // General errors
  INTERNAL_ERROR: 'internal error',
  UNEXPECTED_ERROR: 'unexpected error occurred',
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
  SASL_MECHANISMS,
  SCRAM_STATES,
  TRANSACTION_STATUS,
  DATA_TYPES,
  FORMAT_CODES,
  ERROR_SEVERITY,
  ERROR_CODES,
  ERROR_MESSAGES,
  DEFAULT_SERVER_PARAMETERS,
};
