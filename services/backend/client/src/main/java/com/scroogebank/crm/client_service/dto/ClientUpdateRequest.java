package com.scroogebank.crm.client_service.dto;

import com.scroogebank.crm.client_service.entity.Gender;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

/**
 * Request payload for updating client details (partial updates supported).
 */
public record ClientUpdateRequest(
	@Size(min = 2, max = 50)
	@Pattern(regexp = "^[A-Za-z ]+$")
	String firstName,

	@Size(min = 2, max = 50)
	@Pattern(regexp = "^[A-Za-z ]+$")
	String lastName,

	LocalDate dateOfBirth,

	Gender gender,

	@Email
	String emailAddress,

	@Size(min = 10, max = 15)
	String phoneNumber,

	@Size(min = 5, max = 100)
	String address,

	@Size(min = 2, max = 50)
	String city,

	@Size(min = 2, max = 50)
	String state,

	@Size(min = 2, max = 50)
	String country,

	@Size(min = 4, max = 10)
	String postalCode
) {}
