#![no_std]

pub mod factory;
pub mod router;
pub mod types;
pub mod vault;

pub use factory::{BlinkFactory, BlinkFactoryClient};
pub use vault::{BlinkVault, BlinkVaultClient};

#[cfg(test)]
mod test;
