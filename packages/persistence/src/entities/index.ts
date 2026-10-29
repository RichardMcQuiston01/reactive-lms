import { ActivityNode } from './activity-node.entity';
import { Attempt } from './attempt.entity';
import { ContentPackage } from './content-package.entity';
import { CourseCategory } from './course-category.entity';
import { CourseModule } from './course-module.entity';
import { CourseOffering } from './course-offering.entity';
import { CourseSection } from './course-section.entity';
import { CourseTemplate } from './course-template.entity';
import { EnrolmentMethod } from './enrolment-method.entity';
import { EventLog } from './event-log.entity';
import { Group } from './group.entity';
import { LineItem } from './line-item.entity';
import { LtiLaunchNonce } from './lti-launch-nonce.entity';
import { LtiPlatformDeployment } from './lti-platform-deployment.entity';
import { Membership } from './membership.entity';
import { NormalizedProgress } from './normalized-progress.entity';
import { Person } from './person.entity';
import { Registration } from './registration.entity';
import { Result } from './result.entity';
import { XapiDocument } from './xapi-document.entity';
import { XapiStatement } from './xapi-statement.entity';

export { ActivityNode } from './activity-node.entity';
export { Attempt } from './attempt.entity';
export type { AttemptTermination } from './attempt.entity';
export { ContentPackage } from './content-package.entity';
export { CourseCategory } from './course-category.entity';
export { CourseModule } from './course-module.entity';
export type { ModuleAvailability } from './course-module.entity';
export { CourseOffering } from './course-offering.entity';
export { CourseSection } from './course-section.entity';
export type { CompletionRule } from './course-section.entity';
export { CourseTemplate } from './course-template.entity';
export { EnrolmentMethod } from './enrolment-method.entity';
export type { EnrolmentMethodKind } from './enrolment-method.entity';
export { EventLog } from './event-log.entity';
export { Group } from './group.entity';
export { LineItem } from './line-item.entity';
export { LtiLaunchNonce } from './lti-launch-nonce.entity';
export { LtiPlatformDeployment } from './lti-platform-deployment.entity';
export { Membership } from './membership.entity';
export type {
  MembershipCollectionType,
  MembershipRole,
} from './membership.entity';
export { NormalizedProgress } from './normalized-progress.entity';
export { Person } from './person.entity';
export { Registration } from './registration.entity';
export { Result } from './result.entity';
export { XapiDocument } from './xapi-document.entity';
export type { XapiDocumentKind } from './xapi-document.entity';
export { XapiStatement } from './xapi-statement.entity';

/**
 * TypeORM entity classes shipped by this package.
 */
export const ALL_ENTITIES = [
  Person,
  Group,
  Membership,
  CourseTemplate,
  CourseOffering,
  CourseCategory,
  CourseSection,
  CourseModule,
  EnrolmentMethod,
  ContentPackage,
  ActivityNode,
  Registration,
  Attempt,
  NormalizedProgress,
  LineItem,
  Result,
  XapiStatement,
  XapiDocument,
  LtiPlatformDeployment,
  LtiLaunchNonce,
  EventLog,
];
