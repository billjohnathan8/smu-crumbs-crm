package com.scroogebank.crm.client_service.dto;

import com.scroogebank.crm.client_service.entity.Gender;
import com.scroogebank.crm.client_service.validation.ValidDateOfBirth;
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

	@ValidDateOfBirth
	LocalDate dateOfBirth,

	Gender gender,

	@Email
	String emailAddress,

	@Pattern(regexp = "^\\+\\d{10,15}$", message = "Phone must start with + followed by 10-15 digits")
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
