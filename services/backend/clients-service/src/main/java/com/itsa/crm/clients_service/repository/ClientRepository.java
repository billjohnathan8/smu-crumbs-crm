package com.itsa.crm.clients_service.repository;

import com.itsa.crm.clients_service.entity.ClientEntity;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ClientRepository extends JpaRepository<ClientEntity, Long> {
	boolean existsByEmailAddressIgnoreCase(String emailAddress);

	boolean existsByPhoneNumber(String phoneNumber);

	boolean existsByEmailAddressIgnoreCaseAndIdNot(String emailAddress, Long id);

	boolean existsByPhoneNumberAndIdNot(String phoneNumber, Long id);

	Optional<ClientEntity> findById(Long id);
}
