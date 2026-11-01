import { Inject, Injectable } from '@nestjs/common';
import { Person } from '@richardmcquiston01/reactive-lms-persistence';
import type { LearnerRef } from '@richardmcquiston01/reactive-lms-shared';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { RLMS_DATA_SOURCE } from '../tokens';

/**
 * Upserts a `Person` row from a host {@link LearnerRef}.
 */
@Injectable()
export class PersonDirectory {
  /**
   * @param dataSource - Host TypeORM DataSource
   */
  constructor(
    @Inject(RLMS_DATA_SOURCE)
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Returns the existing person for `learner`, or `null`. Unlike
   * {@link PersonDirectory.ensure} it never inserts, so a lookup made only to
   * compare ownership leaves no row behind for a caller who has none.
   *
   * @param learner - Host identity
   */
  async find(learner: LearnerRef): Promise<Person | null> {
    return this.dataSource.manager.findOne(Person, {
      where: { externalId: learner.externalId },
    });
  }

  /**
   * Returns the existing person for `externalId`, or inserts one.
   *
   * Two first requests for the same learner can arrive together. The insert
   * ignores a conflict on `external_id` and the row is read back, so the loser
   * gets the winner's person instead of a unique-constraint error.
   *
   * @param learner - Host identity
   */
  async ensure(learner: LearnerRef): Promise<Person> {
    const existing = await this.find(learner);
    if (existing) {
      return existing;
    }
    const row = this.dataSource.manager.create(Person, {
      id: randomUUID(),
      externalId: learner.externalId,
      displayName: learner.displayName,
      accountHomepage: learner.accountHomepage ?? null,
      accountName: learner.accountName ?? learner.externalId,
      email: learner.email ?? null,
    });
    await this.dataSource
      .createQueryBuilder()
      .insert()
      .into(Person)
      .values(row)
      .orIgnore()
      .execute();
    const person = await this.find(learner);
    if (!person) {
      throw new Error(
        `Could not create or find a person for external id "${learner.externalId}".`,
      );
    }
    return person;
  }
}
