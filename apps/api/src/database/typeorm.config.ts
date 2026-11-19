import { DataSourceOptions } from 'typeorm';

export const typeOrmOptions = (): DataSourceOptions => ({
  type: 'mysql',
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 3306),
  database: process.env.DB_NAME ?? 'booking',
  username: process.env.DB_USER ?? 'booking',
  password: process.env.DB_PASSWORD,
  entities: [__dirname + '/../**/*.entity.{ts,js}'],
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  synchronize: false,
});
