.PHONY: inframap inframap-full terraform-graph destroy-keep-dns

inframap:
	$(MAKE) -C ../.. inframap

inframap-full:
	$(MAKE) -C ../.. inframap-full

terraform-graph:
	$(MAKE) -C ../.. terraform-graph

destroy-keep-dns:
	./scripts/destroy-app-keep-dns.sh $(ENV) $(EXTRA_VAR_FILE)
