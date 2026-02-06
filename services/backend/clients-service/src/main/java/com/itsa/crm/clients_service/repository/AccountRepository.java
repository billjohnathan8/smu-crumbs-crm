package com.itsa.crm.clients_service.repository;

import com.itsa.crm.clients_service.entity.AccountEntity;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AccountRepository extends JpaRepository<AccountEntity, Long> {
	List<AccountEntity> findByClientId(Long clientId);
}

