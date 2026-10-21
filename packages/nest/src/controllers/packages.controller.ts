import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
  Param,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  PackageImporter,
  type ImportPackageResult,
} from '@reactive-lms/core';
import {
  LmsError,
  PACKAGE_NOT_DETECTED,
  httpStatusForLmsCode,
} from '@reactive-lms/shared';
import { CatalogService, type ContentPackageDetail } from '../catalog/catalog.service';
import { LmsRequestService } from '../identity/lms-request.service';

/**
 * Import, fetch, and delete content packages.
 */
@ApiTags('packages')
@Controller('packages')
export class PackagesController {
  /**
   * @param importer - Core ZIP importer
   * @param catalog - Package GET/DELETE
   * @param request - Identity / capability
   */
  constructor(
    private readonly importer: PackageImporter,
    private readonly catalog: CatalogService,
    private readonly request: LmsRequestService,
  ) {}

  /**
   * Imports a multipart ZIP (`file` field).
   *
   * @param file - Uploaded archive
   * @param req - Host request
   */
  @Post()
  @HttpCode(201)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Import a content package ZIP' })
  async create(
    @UploadedFile() file: { buffer?: Uint8Array } | undefined,
    @Req() req: unknown,
  ): Promise<ImportPackageResult & { id: string }> {
    await this.request.assertCan(req, 'package.import', {
      type: 'content_package',
      id: '*',
    });
    if (!file?.buffer) {
      throw new LmsError({
        status: httpStatusForLmsCode(PACKAGE_NOT_DETECTED),
        code: PACKAGE_NOT_DETECTED,
        message: 'Multipart field "file" is required.',
      });
    }
    const createdByUserId = await this.request.ensurePersonId(req);
    const result = await this.importer.import(file.buffer, { createdByUserId });
    return { ...result, id: result.packageId };
  }

  /**
   * Returns a package and its activity tree.
   *
   * @param id - Package id
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get a content package and activity tree' })
  @ApiParam({ name: 'id' })
  async findOne(@Param('id') id: string): Promise<ContentPackageDetail> {
    return this.catalog.getPackage(id);
  }

  /**
   * Deletes a package, nodes, and extracted files.
   *
   * @param id - Package id
   * @param req - Host request
   */
  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a content package' })
  @ApiParam({ name: 'id' })
  async remove(
    @Param('id') id: string,
    @Req() req: unknown,
  ): Promise<void> {
    await this.request.assertCan(req, 'package.delete', {
      type: 'content_package',
      id,
    });
    await this.catalog.deletePackage(id);
  }
}
