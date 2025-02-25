package com.appsmith.server.services.ce;

import com.appsmith.external.helpers.AppsmithBeanUtils;
import com.appsmith.server.acl.AclPermission;
import com.appsmith.server.constants.FieldName;
import com.appsmith.server.domains.Tenant;
import com.appsmith.server.domains.TenantConfiguration;
import com.appsmith.server.exceptions.AppsmithError;
import com.appsmith.server.exceptions.AppsmithException;
import com.appsmith.server.repositories.TenantRepository;
import com.appsmith.server.services.AnalyticsService;
import com.appsmith.server.services.BaseService;
import com.appsmith.server.services.ConfigService;
import jakarta.validation.Validator;
import org.springframework.data.mongodb.core.ReactiveMongoTemplate;
import org.springframework.data.mongodb.core.convert.MongoConverter;
import org.springframework.util.StringUtils;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Scheduler;

import static com.appsmith.server.acl.AclPermission.MANAGE_TENANT;

public class TenantServiceCEImpl extends BaseService<TenantRepository, Tenant, String> implements TenantServiceCE {

    private String tenantId = null;

    private final ConfigService configService;

    public TenantServiceCEImpl(
            Scheduler scheduler,
            Validator validator,
            MongoConverter mongoConverter,
            ReactiveMongoTemplate reactiveMongoTemplate,
            TenantRepository repository,
            AnalyticsService analyticsService,
            ConfigService configService) {
        super(scheduler, validator, mongoConverter, reactiveMongoTemplate, repository, analyticsService);
        this.configService = configService;
    }

    @Override
    public Mono<String> getDefaultTenantId() {

        // If the value exists in cache, return it as is
        if (StringUtils.hasLength(tenantId)) {
            return Mono.just(tenantId);
        }

        return repository.findBySlug(FieldName.DEFAULT).map(Tenant::getId).map(tenantId -> {
            // Set the cache value before returning.
            this.tenantId = tenantId;
            return tenantId;
        });
    }

    @Override
    public Mono<Tenant> updateTenantConfiguration(String tenantId, TenantConfiguration tenantConfiguration) {
        return repository
                .findById(tenantId, MANAGE_TENANT)
                .switchIfEmpty(Mono.error(
                        new AppsmithException(AppsmithError.ACL_NO_RESOURCE_FOUND, FieldName.TENANT, tenantId)))
                .flatMap(tenant -> {
                    TenantConfiguration oldtenantConfiguration = tenant.getTenantConfiguration();
                    if (oldtenantConfiguration == null) {
                        oldtenantConfiguration = new TenantConfiguration();
                    }
                    AppsmithBeanUtils.copyNestedNonNullProperties(tenantConfiguration, oldtenantConfiguration);
                    tenant.setTenantConfiguration(oldtenantConfiguration);
                    return repository.updateById(tenantId, tenant, MANAGE_TENANT);
                });
    }

    @Override
    public Mono<Tenant> findById(String tenantId, AclPermission permission) {
        return repository
                .findById(tenantId, permission)
                .switchIfEmpty(
                        Mono.error(new AppsmithException(AppsmithError.NO_RESOURCE_FOUND, "tenantId", tenantId)));
    }

    /*
     * For now, returning just the instance-id, with an empty tenantConfiguration object in this class. Will enhance
     * this function once we start saving other pertinent environment variables in the tenant collection.
     */
    @Override
    public Mono<Tenant> getTenantConfiguration() {
        Mono<Tenant> dbTenantMono = getDefaultTenant();
        Mono<Tenant> clientTenantMono = configService.getInstanceId().map(instanceId -> {
            final Tenant tenant = new Tenant();
            tenant.setInstanceId(instanceId);

            final TenantConfiguration config = new TenantConfiguration();
            tenant.setTenantConfiguration(config);

            config.setGoogleMapsKey(System.getenv("APPSMITH_GOOGLE_MAPS_API_KEY"));

            if (StringUtils.hasText(System.getenv("APPSMITH_OAUTH2_GOOGLE_CLIENT_ID"))) {
                config.addThirdPartyAuth("google");
            }

            if (StringUtils.hasText(System.getenv("APPSMITH_OAUTH2_GITHUB_CLIENT_ID"))) {
                config.addThirdPartyAuth("github");
            }

            config.setIsFormLoginEnabled(!"true".equals(System.getenv("APPSMITH_FORM_LOGIN_DISABLED")));

            return tenant;
        });

        return Mono.zip(dbTenantMono, clientTenantMono).map(tuple -> {
            Tenant dbTenant = tuple.getT1();
            Tenant clientTenant = tuple.getT2();
            return getClientPertinentTenant(dbTenant, clientTenant);
        });
    }

    @Override
    public Mono<Tenant> getDefaultTenant() {
        // Get the default tenant object from the DB and then populate the relevant user permissions in that
        // We are doing this differently because `findBySlug` is a Mongo JPA query and not a custom Appsmith query
        return repository
                .findBySlug(FieldName.DEFAULT)
                .map(tenant -> {
                    if (tenant.getTenantConfiguration() == null) {
                        tenant.setTenantConfiguration(new TenantConfiguration());
                    }
                    return tenant;
                })
                .flatMap(tenant -> repository.setUserPermissionsInObject(tenant).switchIfEmpty(Mono.just(tenant)));
    }

    @Override
    public Mono<Tenant> updateDefaultTenantConfiguration(TenantConfiguration tenantConfiguration) {
        return getDefaultTenantId().flatMap(tenantId -> updateTenantConfiguration(tenantId, tenantConfiguration));
    }

    /**
     * To get the Tenant with values that are pertinent to the client
     * @param dbTenant Original tenant from the database
     * @param clientTenant Tenant object that is sent to the client, can be null
     * @return Tenant
     */
    protected Tenant getClientPertinentTenant(Tenant dbTenant, Tenant clientTenant) {
        if (clientTenant == null) {
            clientTenant = new Tenant();
            clientTenant.setTenantConfiguration(new TenantConfiguration());
        }

        final TenantConfiguration tenantConfiguration = clientTenant.getTenantConfiguration();

        // Only copy the values that are pertinent to the client
        tenantConfiguration.copyNonSensitiveValues(dbTenant.getTenantConfiguration());
        clientTenant.setUserPermissions(dbTenant.getUserPermissions());

        return clientTenant;
    }
}
