/**
 * DI token for {@link import('./reactive-lms.module').ReactiveLmsModuleOptions}.
 */
export const RLMS_MODULE_OPTIONS = Symbol('RLMS_MODULE_OPTIONS');

/**
 * DI token for the host TypeORM `DataSource`.
 */
export const RLMS_DATA_SOURCE = Symbol('RLMS_DATA_SOURCE');

/**
 * DI token for the host {@link import('@reactive-lms/shared').IdentityAdapter}.
 */
export const RLMS_IDENTITY_ADAPTER = Symbol('RLMS_IDENTITY_ADAPTER');

/**
 * DI token for the optional host capability adapter.
 */
export const RLMS_CAPABILITY_ADAPTER = Symbol('RLMS_CAPABILITY_ADAPTER');

/**
 * DI token for the configured {@link import('@reactive-lms/shared').StorageAdapter}.
 */
export const RLMS_STORAGE_ADAPTER = Symbol('RLMS_STORAGE_ADAPTER');
