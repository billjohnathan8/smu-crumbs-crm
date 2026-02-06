package com.itsa.crm.client_service.config;

import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Provides a UTC {@link Clock} bean for consistent timestamps.
 */
@Configuration
public class ClockConfig {
	/**
	 * Supplies the system UTC clock.
	 *
	 * @return UTC clock
	 */
	@Bean
	Clock clock() {
		return Clock.systemUTC();
	}
}
