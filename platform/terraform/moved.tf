// Preserve prod resources in-place when migrating the legacy module address
// to the current "sftp_server" module call.
moved {
  from = module.transfer_family
  to   = module.sftp_server
}
