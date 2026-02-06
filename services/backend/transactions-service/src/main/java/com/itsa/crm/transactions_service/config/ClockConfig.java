package com.itsa.crm.transactions_service.config;

import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Centralizes time source configuration for deterministic testing.
 */
@Configuration
public class ClockConfig {
	/**
	 * Exposes a UTC clock for the application.
	 */
	@Bean
	Clock clock() {
		return Clock.systemUTC();
	}
}


