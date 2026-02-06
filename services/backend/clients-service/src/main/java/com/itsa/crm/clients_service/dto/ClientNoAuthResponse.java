package com.itsa.crm.clients_service.dto;

import com.itsa.crm.clients_service.entity.Gender;
import java.time.Instant;
import java.time.LocalDate;

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
