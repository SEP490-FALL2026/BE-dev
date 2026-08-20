import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_METADATA = Symbol('IS_PUBLIC_METADATA');
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_METADATA, true);
