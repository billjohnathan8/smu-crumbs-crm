package com.scroogebank.crm.client_service.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Request payload for verifying a client's identity document.
 */
public record UploadVerificationDocsRequest(
	// Primary Identity Document
    @NotBlank
    @Pattern(regexp = "^(NRIC|PASSPORT|EMPLOYMENT_PASS)$",
             message = "primaryDocumentType must be one of: NRIC, PASSPORT, EMPLOYMENT_PASS")
    String primaryDocumentType,

    @NotBlank
    @Size(max = 120, message = "primaryDocumentRef must be at most 120 characters")
    @Pattern(regexp = "^[A-Za-z0-9._-]+$", message = "primaryDocumentRef contains invalid characters")
    String primaryDocumentRef,       // original filename

    @NotBlank
    @Size(max = 7_000_000, message = "primaryDocumentBase64 exceeds size limits")
    @Pattern(regexp = "^[A-Za-z0-9+/]+={0,2}$", message = "primaryDocumentBase64 must be valid base64")
    String primaryDocumentBase64,    // base64-encoded file content

    @NotBlank
    @Pattern(
    	regexp = "^(image/jpeg|image/png|application/pdf)$",
    	message = "primaryDocumentMimeType must be one of: image/jpeg, image/png, application/pdf"
    )
    String primaryDocumentMimeType,  // e.g. "image/jpeg", "application/pdf"

	// Proof of Address Document
    @NotBlank
    @Pattern(regexp = "^(UTILITY_BILL|BANK_STATEMENT|GOVERNMENT_LETTER|TENANCY_AGREEMENT)$",
             message = "addressDocumentType must be one of: UTILITY_BILL, BANK_STATEMENT, GOVERNMENT_LETTER, TENANCY_AGREEMENT")
    String addressDocumentType,

    @NotBlank
    @Size(max = 120, message = "addressDocumentRef must be at most 120 characters")
    @Pattern(regexp = "^[A-Za-z0-9._-]+$", message = "addressDocumentRef contains invalid characters")
    String addressDocumentRef,       // original filename

    @NotBlank
    @Size(max = 7_000_000, message = "addressDocumentBase64 exceeds size limits")
    @Pattern(regexp = "^[A-Za-z0-9+/]+={0,2}$", message = "addressDocumentBase64 must be valid base64")
    String addressDocumentBase64,    // base64-encoded file content

    @NotBlank
    @Pattern(
    	regexp = "^(image/jpeg|image/png|application/pdf)$",
    	message = "addressDocumentMimeType must be one of: image/jpeg, image/png, application/pdf"
    )
    String addressDocumentMimeType,  // e.g. "image/jpeg", "application/pdf"

    @NotBlank
    @Size(max = 4096, message = "verificationToken is too long")
    @Pattern(regexp = "^[A-Za-z0-9._-]+$", message = "verificationToken format is invalid")
    String verificationToken
) {}
