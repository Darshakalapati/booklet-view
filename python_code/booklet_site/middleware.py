from django.http import JsonResponse

HEALTH_PATH = "/api/health/"


class HealthCheckMiddleware:
    """Answers the host's "is the site up?" check before anything else runs.

    The check comes from inside the host's own network, over plain http and
    with a host name the site does not otherwise accept. Answering here, first
    in line, means it is never redirected or refused.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path == HEALTH_PATH:
            return JsonResponse({"status": "ok"})
        return self.get_response(request)
