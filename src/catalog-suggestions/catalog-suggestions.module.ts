import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { UsersModule } from "../users/users.module";
import { CatalogSuggestionsController } from "./catalog-suggestions.controller";
import { CatalogSuggestionsService } from "./catalog-suggestions.service";
import {
  CatalogSuggestion,
  CatalogSuggestionSchema,
} from "./schemas/catalog-suggestion.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CatalogSuggestion.name, schema: CatalogSuggestionSchema },
    ]),
    UsersModule,
  ],
  controllers: [CatalogSuggestionsController],
  providers: [CatalogSuggestionsService],
  exports: [CatalogSuggestionsService],
})
export class CatalogSuggestionsModule {}
