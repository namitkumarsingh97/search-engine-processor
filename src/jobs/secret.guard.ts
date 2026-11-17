import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, timingSafeEqual } from "crypto";
import { Request } from "express";
import { AppConfig } from "../config/configuration";

const digest = (value: string) => createHash("sha256").update(value).digest();

/** Requires `Authorization: Bearer <PROCESSOR_SECRET>`. With no secret configured, the guarded endpoints stay off. */
@Injectable()
export class SecretGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const secret = this.config.get<AppConfig>("app")!.secret;
    if (!secret) {
      throw new ServiceUnavailableException("PROCESSOR_SECRET is not set, so manual runs are disabled.");
    }

    const header = context.switchToHttp().getRequest<Request>().headers.authorization ?? "";
    const given = header.startsWith("Bearer ") ? header.slice(7) : "";
    // Compare fixed-length hashes in constant time, so the check leaks nothing about the secret.
    if (!given || !timingSafeEqual(digest(given), digest(secret))) {
      throw new UnauthorizedException("Invalid or missing token.");
    }
    return true;
  }
}
