import { Body, Controller, Get, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses } from '../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../infrastructure/http/decorators/api-success-response.decorator';
import { CatalogService } from './catalog.service';
import { CatalogApplicationPage, CatalogApplicationWire } from './catalog.types';
import { ApplicationIdParamDto } from './dto/application-id.dto';
import { CatalogApplicationPageResponseDto, CatalogApplicationResponseDto } from './dto/catalog-application.dto';
import { CreateApplicationBodyDto } from './dto/create-application.dto';
import { ListApplicationsQueryDto } from './dto/list-applications.dto';

/** Every authenticated route can also answer 503 while the identity provider is unreachable. */
const AUTHENTICATION_ERRORS = [
  { status: HttpStatus.UNAUTHORIZED, description: 'Authentication is required.' },
  { status: HttpStatus.SERVICE_UNAVAILABLE, description: 'Authentication is temporarily unavailable.' },
] as const;

@ApiTags('catalog')
@Controller({ path: 'catalog-applications', version: '1' })
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @ApiOperation({ operationId: 'catalogListApplications' })
  @ApiSuccessResponse(CatalogApplicationPageResponseDto, {
    description: 'A page of catalog applications.',
  })
  @ApiErrorResponses(...AUTHENTICATION_ERRORS, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The query parameters are invalid.',
  })
  listApplications(@Query() query: ListApplicationsQueryDto): Promise<CatalogApplicationPage> {
    return this.catalog.listApplications(query);
  }

  @Get(':id')
  @ApiOperation({ operationId: 'catalogGetApplication' })
  @ApiSuccessResponse(CatalogApplicationResponseDto, {
    description: 'The requested catalog application.',
  })
  @ApiErrorResponses(
    ...AUTHENTICATION_ERRORS,
    { status: HttpStatus.NOT_FOUND, description: 'No application has this identifier.' },
    { status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'The identifier is not a UUID.' },
  )
  getApplication(@Param() params: ApplicationIdParamDto): Promise<CatalogApplicationWire> {
    return this.catalog.getApplication(params.id);
  }

  @Post()
  @ApiOperation({ operationId: 'catalogCreateApplication' })
  @ApiSuccessResponse(CatalogApplicationResponseDto, {
    status: HttpStatus.CREATED,
    message: 'CATALOG.APPLICATION_CREATED',
    description: 'The catalog application was created.',
  })
  @ApiErrorResponses(
    ...AUTHENTICATION_ERRORS,
    { status: HttpStatus.CONFLICT, description: 'The slug is already used.' },
    { status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'The request body is invalid.' },
  )
  createApplication(@Body() body: CreateApplicationBodyDto): Promise<CatalogApplicationWire> {
    return this.catalog.createApplication(body);
  }
}
