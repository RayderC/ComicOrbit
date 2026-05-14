from flask import Blueprint

file_manager_blueprint = Blueprint("file_manager", __name__, template_folder="templates")

from . import routes
