package com.scroogebank.crm.client_service;

import com.scroogebank.crm.client_service.repository.AccountRepository;
import com.scroogebank.crm.client_service.repository.ClientRepository;
import tools.jackson.databind.json.JsonMapper;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.autoconfigure.ImportAutoConfiguration;
import org.springframework.boot.flyway.autoconfigure.FlywayAutoConfiguration;
import org.springframework.boot.hibernate.autoconfigure.HibernateJpaAutoConfiguration;
import org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/**
 * Spring context smoke tests for the client service.
 */
@SpringBootTest
@ImportAutoConfiguration(exclude = {
	DataSourceAutoConfiguration.class,
	HibernateJpaAutoConfiguration.class,
	FlywayAutoConfiguration.class
})
class ClientsServiceApplicationTests {
	@MockitoBean
	private ClientRepository clientRepository;

	@MockitoBean
	private AccountRepository accountRepository;

	@MockitoBean
	private JsonMapper objectMapper;

	@Test
	void contextLoads() {
	}

}
