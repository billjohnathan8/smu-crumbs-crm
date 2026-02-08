package com.scroogebank.crm.client_service.dto;

import com.scroogebank.crm.client_service.entity.Gender;
import java.time.Instant;
import java.time.LocalDate;

/**
 * Legacy no-auth response payload for client details.
 */
public record ClientNoAuthResponse(
	long clientId,
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
	String assignedAgentId,
	Instant createdAt,
	Instant updatedAt
) {}
