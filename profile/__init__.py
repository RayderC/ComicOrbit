from flask import Blueprint

profile_blueprint = Blueprint("profile", __name__, template_folder="templates")

from . import routes
