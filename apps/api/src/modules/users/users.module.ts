import { Controller, Get, Patch, Body, Param, Module } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { PrismaService } from '../../prisma/prisma.service';
import { Audit, Roles } from '../../common/decorators';

@ApiTags('users')
@Controller('users')
class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Roles('ADMIN')
  @Get()
  list() {
    return this.prisma.user.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        presenter: { select: { id: true, displayName: true } },
      },
    });
  }

  @Roles('ADMIN')
  @Audit('user.updated')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: { role?: any; isActive?: boolean; name?: string }) {
    return this.prisma.user.update({
      where: { id },
      data: {
        ...(body.role ? { role: body.role } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        ...(body.name ? { name: body.name } : {}),
      },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });
  }
}

@ApiTags('settings')
@Controller('settings')
class SettingsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  get() {
    return this.prisma.appSetting.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton' },
      update: {},
    });
  }

  @Roles('ADMIN')
  @Audit('settings.updated')
  @Patch()
  update(@Body() body: Record<string, unknown>) {
    return this.prisma.appSetting.update({ where: { id: 'singleton' }, data: body });
  }
}

@Module({ controllers: [UsersController, SettingsController] })
export class UsersModule {}
