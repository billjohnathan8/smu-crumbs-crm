package com.itsa.crm.clients_service.dto;

import com.itsa.crm.clients_service.entity.Gender;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

public record ClientCreateRequest(
	@NotBlank
	@Size(min = 2, max = 50)
	@Pattern(regexp = "^[A-Za-z ]+$")
	String firstName,

	@NotBlank
	@Size(min = 2, max = 50)
	@Pattern(regexp = "^[A-Za-z ]+$")
	String lastName,

	@NotNull
	LocalDate dateOfBirth,

	@NotNull
	Gender gender,

	@NotBlank
	@Email
	String emailAddress,

	@NotBlank
	@Size(min = 10, max = 15)
	String phoneNumber,

	@NotBlank
	@Size(min = 5, max = 100)
	String address,

	@NotBlank
	@Size(min = 2, max = 50)
	String city,

	@NotBlank
	@Size(min = 2, max = 50)
	String state,

	@NotBlank
	@Size(min = 2, max = 50)
	String country,

	@NotBlank
	@Size(min = 4, max = 10)
	String postalCode
) {}
