import { Module } from '@nestjs/common';
import { VisionModule } from '../vision/vision.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [VisionModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
