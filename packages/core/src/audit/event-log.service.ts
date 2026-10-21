import { EventLog } from '@reactive-lms/persistence';
import type { DataSource, EntityManager } from 'typeorm';

/**
 * Fields recorded on an append-only {@link EventLog} row.
 */
export interface EventLogRecord {
  /** Actor or subject person when known. */
  personId?: string | null;
  /** Machine-readable action (`package.imported`, `enrol.joined`, …). */
  action: string;
  /** Entity type the action refers to. */
  subjectType?: string | null;
  /** Entity id the action refers to. */
  subjectId?: string | null;
  /** Optional structured payload. */
  payload?: Record<string, unknown>;
}

/**
 * Writes `rlms_event_log` rows. Accepts an optional manager so callers
 * can record inside an existing transaction.
 */
export class EventLogService {
  /**
   * @param dataSource - Caller-owned TypeORM DataSource
   */
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Inserts one audit event.
   *
   * @param input - Action, subject, and optional payload
   * @param manager - Transaction manager; defaults to `dataSource.manager`
   */
  async record(input: EventLogRecord, manager?: EntityManager): Promise<void> {
    const em = manager ?? this.dataSource.manager;
    const row = em.create(EventLog, {
      personId: input.personId ?? null,
      action: input.action,
      subjectType: input.subjectType ?? null,
      subjectId: input.subjectId ?? null,
      payloadJson: input.payload ?? null,
    });
    await em.save(row);
  }
}
