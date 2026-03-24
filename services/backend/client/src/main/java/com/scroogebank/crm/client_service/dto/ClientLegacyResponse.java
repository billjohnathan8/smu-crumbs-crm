package com.scroogebank.crm.client_service.dto;

import com.scroogebank.crm.client_service.entity.Gender;
import java.time.Instant;
import java.time.LocalDate;

/**
 * @deprecated Use {@link ClientNoAuthResponse}.
 */
@Deprecated(forRemoval = true)
public record ClientLegacyResponse(
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
	String assignedUserId,
	Instant createdAt,
	Instant updatedAt
) {}
