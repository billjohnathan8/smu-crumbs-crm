package com.scroogebank.crm.userservice.config;

import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Provides a UTC {@link Clock} for time-based logic.
 */
@Configuration
public class ClockConfig {
	/**
	 * Returns the system UTC clock.
	 *
	 * @return UTC clock
	 */
	@Bean
	public Clock clock() {
		return Clock.systemUTC();
	}
}
