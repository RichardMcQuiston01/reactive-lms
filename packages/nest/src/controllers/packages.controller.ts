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
  Query,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { PackageImporter } from '@richardmcquiston01/reactive-lms-core';
import {
  LmsError,
  PACKAGE_NOT_DETECTED,
  httpStatusForLmsCode,
  type ContentPackageDto,
  type ImportPackageResultDto,
} from '@richardmcquiston01/reactive-lms-shared';
import {
  CatalogService,
  type ContentPackageDetail,
} from '../catalog/catalog.service';
import { LmsRequestService } from '../identity/lms-request.service';
import { PackageImportGuard } from './package-import.guard';

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
   * Imports a multipart ZIP (`file` field). Permission is checked by
   * {@link PackageImportGuard} before the body is buffered, and the upload is
   * capped by the module's `maxUploadBytes` (413 when exceeded).
   *
   * @param file - Uploaded archive
   * @param req - Host request
   */
  @Post()
  @HttpCode(201)
  @UseGuards(PackageImportGuard)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Import a content package ZIP' })
  async create(
    @UploadedFile() file: { buffer?: Uint8Array } | undefined,
    @Req() req: unknown,
  ): Promise<ImportPackageResultDto> {
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
   * Lists imported packages, newest first.
   *
   * @param limit - Rows to return (default 200, at most 500)
   * @param offset - Rows to skip
   * @param req - Host request
   */
  @Get()
  @ApiOperation({ summary: 'List content packages' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  async list(
    @Req() req: unknown,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<ContentPackageDto[]> {
    await this.request.assertCan(req, 'module.manage', {
      type: 'content_package',
      id: '*',
    });
    return this.catalog.listPackages({
      limit: limit === undefined ? undefined : Number(limit),
      offset: offset === undefined ? undefined : Number(offset),
    });
  }

  /**
   * Returns a package and its activity tree.
   *
   * @param id - Package id
   * @param req - Host request
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get a content package and activity tree' })
  @ApiParam({ name: 'id' })
  async findOne(
    @Param('id') id: string,
    @Req() req: unknown,
  ): Promise<ContentPackageDetail> {
    await this.request.assertCan(req, 'module.manage', {
      type: 'content_package',
      id,
    });
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
  async remove(@Param('id') id: string, @Req() req: unknown): Promise<void> {
    await this.request.assertCan(req, 'package.delete', {
      type: 'content_package',
      id,
    });
    await this.catalog.deletePackage(id);
  }
}
