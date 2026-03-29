package com.scroogebank.crm.client_service.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/**
 * Request payload for verifying a client's identity document.
 */
public record UploadVerificationDocsRequest(
	// Primary Identity Document
    @NotBlank
    @Pattern(regexp = "^(NRIC|PASSPORT|EMPLOYMENT_PASS)$",
             message = "primaryDocumentType must be one of: NRIC, PASSPORT, EMPLOYMENT_PASS, DRIVING_LICENCE")
    String primaryDocumentType,

    @NotBlank
    String primaryDocumentRef,       // original filename

    @NotBlank
    String primaryDocumentBase64,    // base64-encoded file content

    @NotBlank
    String primaryDocumentMimeType,  // e.g. "image/jpeg", "application/pdf"

	// Proof of Address Document
    @NotBlank
    @Pattern(regexp = "^(UTILITY_BILL|BANK_STATEMENT|GOVERNMENT_LETTER|TENANCY_AGREEMENT)$",
             message = "addressDocumentType must be one of: UTILITY_BILL, BANK_STATEMENT, GOVERNMENT_LETTER, TENANCY_AGREEMENT")
    String addressDocumentType,

    @NotBlank
    String addressDocumentRef,       // original filename

    @NotBlank
    String addressDocumentBase64,    // base64-encoded file content

    @NotBlank
    String addressDocumentMimeType,  // e.g. "image/jpeg", "application/pdf"

    @NotBlank
    String verificationToken
) {}
