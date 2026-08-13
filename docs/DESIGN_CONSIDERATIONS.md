# Learning Management System (LMS)

## Overview

- Need to develop a standardized LMS
- Should be developed in such a way that it could be run standalone, or it could be integrated into our existing NestJS API backend running TypeORM 
- We are using an Angular frontend, so that should be taken into account as to how courses are launched, course progress is recorded, etc.
- LMS should confirm to IMSGlobal specifications
- LMS should be capable of using multiple package types
  - SCORM 1.2
  - SCORM 2004
  - xAPI
  - cmi5
  - HTML5 Bundle
  - H5P
  - LTI
- It should allow for integration with NestJS to record course progress
- Interfaces, Models, and or Services should be stored in a shared library for integration into frontend or backend implementations
- TypeORM migrations should exist for incorporating into existing databases

## Resources

- <https://www.1edtech.org/standards/lti>
- <https://www.imsglobal.org/1edtech-learning-information-services-overview>
- <https://www.imsglobal.org/lis/lisv2p0p1/LISSpecificationv2p0p1.html>
- <https://scorm.com/scorm-explained/technical-scorm/>
- <https://xapi.com/specification/>
- <https://xapi.com/cmi5/overview/>
- <https://www.docebo.com/learning-network/blog/lms-requirements/>
