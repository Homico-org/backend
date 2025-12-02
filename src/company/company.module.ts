import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CompanyController } from './company.controller';
import { CompanyService } from './company.service';
import { Company, CompanySchema } from './schemas/company.schema';
import { CompanyEmployee, CompanyEmployeeSchema } from './schemas/company-employee.schema';
import { CompanyJob, CompanyJobSchema } from './schemas/company-job.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Company.name, schema: CompanySchema },
      { name: CompanyEmployee.name, schema: CompanyEmployeeSchema },
      { name: CompanyJob.name, schema: CompanyJobSchema },
    ]),
  ],
  controllers: [CompanyController],
  providers: [CompanyService],
  exports: [CompanyService],
})
export class CompanyModule {}
