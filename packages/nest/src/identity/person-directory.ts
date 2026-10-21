import { Inject, Injectable } from '@nestjs/common';
import { Person } from '@reactive-lms/persistence';
import type { LearnerRef } from '@reactive-lms/shared';
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
   * Returns the existing person for `externalId`, or inserts one.
   *
   * @param learner - Host identity
   */
  async ensure(learner: LearnerRef): Promise<Person> {
    const existing = await this.dataSource.manager.findOne(Person, {
      where: { externalId: learner.externalId },
    });
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
    return this.dataSource.manager.save(row);
  }
}
