import 'dotenv/config';
import { DataSource } from 'typeorm';
import { typeOrmOptions } from './typeorm.config';

// Used by the TypeORM CLI (migration:generate / migration:run).
export default new DataSource(typeOrmOptions());
