from typing import NoReturn

from fastapi import HTTPException, status 


def raise_obj_not_found(object: str) -> NoReturn:
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"{object} not found",
    )
    
    
def raise_invalid_email_or_password() -> NoReturn:
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid email or password",
    )


def raise_unable_to_create_obj(object: str) -> NoReturn:
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Unable to create {object}",
    )
    

def raise_credentials_exception():
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Incorrect email or password",
        headers={"WWW-Authenticate": "Bearer"},
    )

def raise_email_already_registered():
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="Email already registered"
    )