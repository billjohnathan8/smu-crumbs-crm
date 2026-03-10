package com.scroogebank.crm.client_service.validation;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Unit tests for {@link DateOfBirthValidator}.
 */
class DateOfBirthValidatorTest {

	private DateOfBirthValidator validator;

	@BeforeEach
	void setUp() {
		validator = new DateOfBirthValidator();
	}

	@Test
	void nullValue_isValid() {
		assertThat(validator.isValid(null, null)).isTrue();
	}

	@Test
	void today_isInvalid() {
		assertThat(validator.isValid(LocalDate.now(), null)).isFalse();
	}

	@Test
	void futureDate_isInvalid() {
		assertThat(validator.isValid(LocalDate.now().plusDays(1), null)).isFalse();
	}

	@Test
	void ageSixteen_isInvalid() {
		LocalDate dob = LocalDate.now().minusYears(16);
		assertThat(validator.isValid(dob, null)).isFalse();
	}

	@Test
	void ageSeventeen_isInvalid() {
		LocalDate dob = LocalDate.now().minusYears(17);
		assertThat(validator.isValid(dob, null)).isFalse();
	}

	@Test
	void ageEighteen_isValid() {
		LocalDate dob = LocalDate.now().minusYears(18).minusDays(1);
		assertThat(validator.isValid(dob, null)).isTrue();
	}

	@Test
	void ageExactlyEighteen_boundaryCheck() {
		LocalDate exactlyEighteen = LocalDate.now().minusYears(18);
		assertThat(validator.isValid(exactlyEighteen, null)).isTrue();
	}

	@Test
	void ageFifty_isValid() {
		LocalDate dob = LocalDate.now().minusYears(50);
		assertThat(validator.isValid(dob, null)).isTrue();
	}

	@Test
	void ageHundred_isValid() {
		LocalDate dob = LocalDate.now().minusYears(100);
		assertThat(validator.isValid(dob, null)).isTrue();
	}

	@Test
	void ageHundredAndOne_isInvalid() {
		LocalDate dob = LocalDate.now().minusYears(101);
		assertThat(validator.isValid(dob, null)).isFalse();
	}
}
