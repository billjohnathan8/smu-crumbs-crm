package com.itsa.crm.client_service.dto;

import com.itsa.crm.client_service.entity.Gender;
import java.time.LocalDate;
import java.time.Instant;

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
	String assignedAgentId,
	Instant createdAt,
	Instant updatedAt
) {}
