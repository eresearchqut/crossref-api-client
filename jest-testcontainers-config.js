module.exports = {
    crossref: {
        image: 'wiremock/wiremock',
        ports: [8080],
        resourcesQuota: {
            memory: 0.25
        },
        command: ['--verbose', '--disable-banner']
    }
}
