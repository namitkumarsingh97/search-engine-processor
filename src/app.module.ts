import { Logger, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import { ScheduleModule } from "@nestjs/schedule";
import configuration, { AppConfig, validateEnv } from "./config/configuration";
import { HealthController } from "./health/health.controller";
import { JobsModule } from "./jobs/jobs.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration], validate: validateEnv }),
    ScheduleModule.forRoot(),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<AppConfig>("app")!.mongoUri,
        serverSelectionTimeoutMS: 15_000,
        // Log the host only: the connection string contains the password.
        connectionFactory: (connection: import("mongoose").Connection) => {
          connection.on("connected", () => new Logger("Database").log(`connected to ${connection.host}/${connection.name}`));
          connection.on("disconnected", () => new Logger("Database").warn("disconnected"));
          return connection;
        },
      }),
    }),
    JobsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
