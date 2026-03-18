package com.scroogebank.crm.client_service.dto;

import java.time.Instant;
import java.time.LocalDate;

import com.scroogebank.crm.client_service.entity.Gender;

/**
 * API representation of a client record.
 */
public record ClientDto(
	String clientId,
	String firstName,
	String lastName,
	LocalDate dateOfBirth,
	Gender gender,
	String emailAddress,
	String phoneNumber,
	String address,
	String city,
	String state,
	String country,
	String postalCode,
	IdentityVerificationStatus identityVerificationStatus,
	String assignedUserId,
	String verificationDocumentType,
	String verificationDocumentRef,
	Instant verificationVerifiedAt,
	Instant createdAt,
	Instant updatedAt
) {}
