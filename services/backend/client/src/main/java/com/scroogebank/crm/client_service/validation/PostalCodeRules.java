package com.scroogebank.crm.client_service.validation;

import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Country-specific postal code validation rules used by client create/update flows.
 */
public final class PostalCodeRules {
	private static final Rule FALLBACK_RULE = new Rule(
		"Other",
		Pattern.compile("^[A-Za-z0-9][A-Za-z0-9 -]{3,9}$")
	);

	private static final List<Rule> RULES = List.of(
		new Rule("Singapore", Pattern.compile("^\\d{6}$")),
		new Rule("United States", Pattern.compile("^\\d{5}(?:-\\d{4})?$")),
		new Rule("United Kingdom", Pattern.compile("^[A-Z]{1,2}\\d[A-Z\\d]?\\s?\\d[A-Z]{2}$", Pattern.CASE_INSENSITIVE)),
		new Rule("Canada", Pattern.compile("^[A-Za-z]\\d[A-Za-z][ -]?\\d[A-Za-z]\\d$")),
		new Rule("Australia", Pattern.compile("^\\d{4}$")),
		new Rule("Germany", Pattern.compile("^\\d{5}$")),
		new Rule("France", Pattern.compile("^\\d{5}$")),
		new Rule("India", Pattern.compile("^\\d{6}$")),
		new Rule("Japan", Pattern.compile("^\\d{3}-?\\d{4}$")),
		FALLBACK_RULE
	);

	private PostalCodeRules() {}

	public static String validate(String country, String postalCode) {
		String normalizedCountry = country == null ? "" : country.trim();
		String normalizedPostalCode = postalCode == null ? "" : postalCode.trim();

		if (normalizedCountry.isEmpty()) {
			return "Country is required";
		}
		if (normalizedPostalCode.isEmpty()) {
			return "Postal code is required";
		}
		if (normalizedPostalCode.length() < 4 || normalizedPostalCode.length() > 10) {
			return "Postal code must be 4-10 characters";
		}

		Rule rule = ruleForCountry(normalizedCountry);
		if (!rule.pattern().matcher(normalizedPostalCode).matches()) {
			return "Postal code must match " + rule.country() + " format";
		}
		return null;
	}

	private static Rule ruleForCountry(String country) {
		String normalized = country.trim().toLowerCase(Locale.ROOT);
		return RULES.stream()
			.filter(rule -> rule.country().toLowerCase(Locale.ROOT).equals(normalized))
			.findFirst()
			.orElse(FALLBACK_RULE);
	}

	private record Rule(String country, Pattern pattern) {}
}

