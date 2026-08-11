import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { confirmUploadSchema, linkAttachmentSchema, presignUploadSchema } from '@presenter-ops/shared';

import { FilesService } from './files.service';
import { Audit, CurrentUser, Roles, type AuthenticatedUser } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';

@ApiTags('files')
@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  /** Step 1 of an upload — get a url the browser can PUT straight to. */
  @Roles('ADMIN', 'PRODUCER', 'MARKETING')
  @Post('presign')
  presign(@Body(zodBody(presignUploadSchema)) body: any) {
    return this.files.presign(body);
  }

  /** Step 2 — tell the API the object landed, and attach it to a record. */
  @Roles('ADMIN', 'PRODUCER', 'MARKETING')
  @Audit('file.uploaded')
  @Post('confirm')
  confirm(@Body(zodBody(confirmUploadSchema)) body: any, @CurrentUser() user: AuthenticatedUser) {
    return this.files.confirm(body, user);
  }

  /** Attach a OneDrive / SharePoint link instead of uploading bytes. */
  @Audit('file.linked')
  @Post('link')
  link(@Body(zodBody(linkAttachmentSchema)) body: any, @CurrentUser() user: AuthenticatedUser) {
    return this.files.link(body, user);
  }

  @Get(':id/download')
  download(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.files.getDownloadUrl(id, user);
  }

  @Audit('file.removed')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.files.remove(id, user);
  }
}
