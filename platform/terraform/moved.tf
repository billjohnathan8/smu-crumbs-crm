// Preserve prod resources in-place when renaming the module call from
// "transfer_family" to "sftp_server".
moved {
  from = module.transfer_family
  to   = module.sftp_server
}
