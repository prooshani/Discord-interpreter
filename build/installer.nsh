!macro customInit
  nsExec::ExecToLog 'taskkill /IM "${APP_EXECUTABLE_FILENAME}" /T /F'
!macroend

!macro customInstall
  CreateShortcut "$SMPROGRAMS\\$STARTMENU_FOLDER\\Uninstall ${PRODUCT_NAME}.lnk" "$INSTDIR\\Uninstall ${PRODUCT_FILENAME}.exe"
!macroend

!macro customUnInstall
  Delete "$SMPROGRAMS\\$STARTMENU_FOLDER\\Uninstall ${PRODUCT_NAME}.lnk"
!macroend
