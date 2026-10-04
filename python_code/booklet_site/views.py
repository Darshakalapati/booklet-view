from django.conf import settings
from django.http import HttpResponse, JsonResponse


def health(request):
    """The host calls this to check that the site is up."""
    return JsonResponse({"status": "ok"})


def screens(request):
    """Send the screens (the built React app) for every address that is not the API.

    The screens decide what to show from the address themselves, so
    /books/3 and /trash all get the same index.html.
    """
    index = settings.FRONTEND_DIST / "index.html"
    if not index.is_file():
        return HttpResponse(
            "The screens have not been built. Run `npm run build` in the frontend folder, "
            "or use `npm run dev` while developing.",
            status=503,
            content_type="text/plain",
        )
    response = HttpResponse(index.read_bytes(), content_type="text/html; charset=utf-8")
    response["Cache-Control"] = "no-cache"  # always fetch the newest version of the app
    return response
