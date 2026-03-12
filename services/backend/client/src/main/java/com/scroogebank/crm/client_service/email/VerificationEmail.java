package com.scroogebank.crm.client_service.email;

/**
 * Immutable outbound verification email payload.
 *
 * @param toEmail recipient email address
 * @param subject subject line
 * @param body plain text email body
 */
public record VerificationEmail(String toEmail, String subject, String body) {}
